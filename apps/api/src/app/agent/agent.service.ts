import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Neo4jService } from '../neo4j/neo4j.service';
import { UserService } from '../users/user.service';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { HuggingFaceTransformersEmbeddings } from '@langchain/community/embeddings/huggingface_transformers';
import { StateGraph, START, END } from '@langchain/langgraph';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseMessage, HumanMessage, SystemMessage, MessageContentImageUrl } from '@langchain/core/messages';
import pdfParse from 'pdf-parse';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HealthEvent, HealthEventDocument } from '../health-events/health-event.schema';
import { DietLog, DietLogDocument } from '../diet-logs/diet-log.schema';
import { Lifestyle, LifestyleDocument } from '../lifestyle/lifestyle.schema';

// ── Available models ──────────────────────────────────────────────────────────

export const AVAILABLE_MODELS = [
  { id: 'claude-sonnet-4-6',       label: 'Claude',       provider: 'anthropic', note: 'Best quality'           },
  { id: 'gpt-4o-mini',             label: 'GPT-4o Mini',  provider: 'openai',    note: 'Fast & affordable'      },
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3',    provider: 'groq',      note: 'Free — console.groq.com' },
  { id: 'gemini-1.5-flash',        label: 'Gemini Flash', provider: 'google',    note: 'Free — aistudio.google.com' },
] as const;

export type ModelId = typeof AVAILABLE_MODELS[number]['id'];
export const DEFAULT_MODEL = 'claude-sonnet-4-6';

// ── Interfaces ─────────────────────────────────────────────────────────────────

interface UserProfileSnapshot {
  name: string;
  knownAllergies: string[];
  medicalConditions: string[];
  medications: string[];
  biologicalSex?: string;
  bloodType?: string;
}

interface RetrievedChunk {
  type: string;
  text: string;
  similarity: number;
  date?: string;
}

interface ParsedHealthData {
  healthEvents?: {
    eventType: string;        // DOCTOR_VISIT | DISEASE_DIAGNOSIS | MEDICATION | TREATMENT_START
    titles: string[];
    description: string;
    status: string;
    details?: {
      doctorName?: string;
      medicationName?: string;
      dosage?: string;
      symptoms?: string[];
      doctorNotes?: string;
    };
  }[];
  dietAdvice?: { description: string; mealTypes: string[] }[];
  lifestyleAdvice?: { description: string; categories: string[] }[];
  newConditions?: string[];   // pushed to user.medicalConditions
  newMedications?: string[];  // pushed to user.medications
}

interface AgentState {
  userId: string;
  userProfile: UserProfileSnapshot;
  message: string;
  conversationHistory: BaseMessage[];
  intent: string[];
  retrievedContext: RetrievedChunk[];
  parsedData: ParsedHealthData | null;
  storageFeedback: string;
  response: string;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  // Per-model LLM singletons — created on first use
  private readonly _llmCache = new Map<string, BaseChatModel>();
  // Per-model compiled graphs
  private readonly _graphCache = new Map<string, any>();

  private _embeddings: HuggingFaceTransformersEmbeddings | null = null;

  private get embeddings(): HuggingFaceTransformersEmbeddings {
    if (!this._embeddings) {
      // Local model — no API key required. Downloads ~90 MB on first use, then cached.
      this._embeddings = new HuggingFaceTransformersEmbeddings({
        model: 'Xenova/all-MiniLM-L6-v2',
      });
    }
    return this._embeddings;
  }

  constructor(
    private neo4jService: Neo4jService,
    @Inject(forwardRef(() => UserService)) private userService: UserService,
    @InjectModel(HealthEvent.name) private healthEventModel: Model<HealthEventDocument>,
    @InjectModel(DietLog.name) private dietLogModel: Model<DietLogDocument>,
    @InjectModel(Lifestyle.name) private lifestyleModel: Model<LifestyleDocument>
  ) {
    this.ensureVectorIndex();
  }

  // ── LLM factory ──────────────────────────────────────────────────────────────

  getLLM(modelId: string = DEFAULT_MODEL): BaseChatModel {
    if (this._llmCache.has(modelId)) return this._llmCache.get(modelId)!;

    let llm: BaseChatModel;

    if (modelId.startsWith('claude')) {
      llm = new ChatAnthropic({ model: modelId, temperature: 0 });

    } else if (modelId.startsWith('gpt')) {
      llm = new ChatOpenAI({ model: modelId, temperature: 0 });

    } else if (modelId.startsWith('gemini')) {
      // Pass key explicitly — dotenv may leave surrounding spaces in the value
      const apiKey = (process.env.GOOGLE_API_KEY ?? '').trim();
      llm = new ChatGoogleGenerativeAI({
        model: modelId,
        temperature: 0,
        apiKey,
        // Force stable v1 API — v1beta dropped several 1.5 model aliases
        apiVersion: 'v1',
      } as any);

    } else if (
      modelId.startsWith('llama') ||
      modelId.startsWith('gemma') ||
      modelId.startsWith('mixtral') ||
      modelId.startsWith('qwen') ||
      modelId.startsWith('deepseek')
    ) {
      // Groq hosts open-weight models with a generous free tier
      llm = new ChatGroq({ model: modelId, temperature: 0 });

    } else {
      this.logger.warn(`Unknown model "${modelId}", falling back to Claude.`);
      llm = new ChatAnthropic({ model: DEFAULT_MODEL, temperature: 0 });
    }

    this._llmCache.set(modelId, llm);
    return llm;
  }

  private getGraph(modelId: string): any {
    if (!this._graphCache.has(modelId)) {
      this._graphCache.set(modelId, this.buildGraph(this.getLLM(modelId)));
    }
    return this._graphCache.get(modelId);
  }

  // ── Vector index management ────────────────────────────────────────────────

  private async ensureVectorIndex(): Promise<void> {
    const driver = this.neo4jService.getDriver();
    if (!driver) return;
    const session = driver.session();
    try {
      await session.run(
        `CREATE VECTOR INDEX userHealthChunks IF NOT EXISTS
         FOR (c:UserHealthChunk) ON c.embedding
         OPTIONS { indexConfig: { \`vector.dimensions\`: 384, \`vector.similarity_function\`: 'cosine' } }`
      );
      this.logger.log('Neo4j vector index ensured.');
    } catch (err: any) {
      this.logger.warn('Vector index init skipped:', err.message);
    } finally {
      await session.close();
    }
  }

  // ── Public embedding utility ───────────────────────────────────────────────

  async embedAndStore(
    userId: string,
    sourceId: string,
    chunkType: string,
    text: string,
    date: string
  ): Promise<void> {
    const driver = this.neo4jService.getDriver();
    if (!driver) return;
    try {
      const vector = await this.embeddings.embedQuery(text);
      const session = driver.session();
      try {
        await session.run(
          `MERGE (c:UserHealthChunk {id: $sourceId})
           SET c.userId    = $userId,
               c.chunkType = $chunkType,
               c.text      = $text,
               c.date      = $date,
               c.embedding = $vector`,
          { sourceId, userId, chunkType, text, date, vector }
        );
      } finally {
        await session.close();
      }
    } catch (err: any) {
      this.logger.warn(`embedAndStore failed [${chunkType}:${sourceId}]: ${err.message}`);
    }
  }

  // ── Private node helpers ───────────────────────────────────────────────────

  private async _classifyIntent(message: string, llm: BaseChatModel): Promise<string[]> {
    const res = await llm.invoke([
      new SystemMessage(
        'Classify the user message into one or more of: HEALTH_RECORD, DIET_LOG, LIFESTYLE_LOG, ' +
        'MEDICAL_REPORT, MEAL_PLAN, QUERY, OTHER. ' +
        'MEDICAL_REPORT means the message IS a medical report/lab result/doctor notes to be parsed and stored. ' +
        'Return ONLY comma-separated labels, nothing else.'
      ),
      new HumanMessage(message)
    ]);
    return (res.content as string).split(',').map(s => s.trim().toUpperCase());
  }

  private async _retrieveContext(userId: string, message: string): Promise<RetrievedChunk[]> {
    const driver = this.neo4jService.getDriver();
    if (!driver) return [];
    try {
      const queryVector = await this.embeddings.embedQuery(message);
      const session = driver.session();
      try {
        const result = await session.run(
          `CALL db.index.vector.queryNodes('userHealthChunks', 20, $queryVector)
           YIELD node AS c, score
           WHERE c.userId = $userId
           RETURN c.chunkType AS type, c.text AS text, c.date AS date, score
           ORDER BY score DESC
           LIMIT 8`,
          { queryVector, userId }
        );
        return result.records.map(r => ({
          type:       r.get('type'),
          text:       r.get('text'),
          similarity: r.get('score'),
          date:       r.get('date'),
        }));
      } finally {
        await session.close();
      }
    } catch (err: any) {
      this.logger.warn('retrieveContext skipped (Neo4j unavailable):', err.message);
      return [];
    }
  }

  // Robust JSON extractor — handles prose before/after and markdown code fences
  private _extractJson(text: string): any {
    let s = text
      .replace(/^```json\s*/im, '')
      .replace(/^```\s*/im, '')
      .replace(/\s*```\s*$/m, '')
      .trim();
    const start = s.indexOf('{');
    const end   = s.lastIndexOf('}');
    if (start !== -1 && end > start) s = s.slice(start, end + 1);
    return JSON.parse(s);
  }

  private async _parseMedicalReport(message: string, llm: BaseChatModel): Promise<ParsedHealthData> {
    const systemPrompt =
      'You are a medical data extraction system. Extract ALL information from the medical report.\n' +
      'Return ONLY a valid JSON object — no prose, no markdown fences, nothing else.\n\n' +
      'Required JSON shape:\n' +
      '{\n' +
      '  "healthEvents": [\n' +
      '    One DOCTOR_VISIT event for the consultation:\n' +
      '    { "eventType": "DOCTOR_VISIT", "titles": ["<Visit type & doctor>"], "description": "<summary>", "status": "ACTIVE", "details": { "doctorName": "<name>", "doctorNotes": "<key findings>" } },\n' +
      '    One DISEASE_DIAGNOSIS event PER diagnosis/finding:\n' +
      '    { "eventType": "DISEASE_DIAGNOSIS", "titles": ["<diagnosis>"], "description": "<detail>", "status": "ACTIVE" },\n' +
      '    One MEDICATION event PER prescribed medication:\n' +
      '    { "eventType": "MEDICATION", "titles": ["<drug name>"], "description": "<freq, duration, instructions>", "status": "ACTIVE", "details": { "medicationName": "<name>", "dosage": "<dose & frequency>" } }\n' +
      '  ],\n' +
      '  "dietAdvice": [ { "description": "<one dietary instruction>", "mealTypes": ["BREAKFAST","LUNCH","DINNER"] } ],\n' +
      '  "lifestyleAdvice": [ { "description": "<one lifestyle instruction>", "categories": ["EXERCISE","SLEEP","DIET"] } ],\n' +
      '  "newConditions": ["<each diagnosis as a plain string>"],\n' +
      '  "newMedications": ["<each medication with dosage as a plain string>"]\n' +
      '}\n\n' +
      'IMPORTANT: include EVERY diagnosis, EVERY medication, and EVERY advice item from the report.';

    try {
      const res = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(message),
      ]);
      const parsed = this._extractJson(res.content as string);
      this.logger.log(`parseMedicalReport: ${parsed.healthEvents?.length ?? 0} events, ${parsed.newConditions?.length ?? 0} conditions, ${parsed.newMedications?.length ?? 0} medications`);
      return parsed;
    } catch (err: any) {
      this.logger.error('parseMedicalReport failed:', err.message);
      return { healthEvents: [], dietAdvice: [], lifestyleAdvice: [], newConditions: [], newMedications: [] };
    }
  }

  private async _storeReport(userId: string, parsedData: ParsedHealthData): Promise<string> {
    const today = new Date();
    let savedEvents = 0;

    // ── Save all health events (visits, diagnoses, medications) ───────────────
    for (const event of parsedData?.healthEvents ?? []) {
      try {
        const titles = event.titles?.length
          ? event.titles
          : [event.description?.slice(0, 60) || 'Health Event'];
        const doc = await new this.healthEventModel({
          eventType:   event.eventType,
          titles,
          description: event.description,
          status:      event.status || 'ACTIVE',
          details:     event.details ?? {},
          userId,
          source: 'AI',
          date:   today,
        }).save();
        const text = `${event.eventType} on ${doc.date.toISOString().slice(0, 10)}: ` +
                     `${titles.join(', ')} — ${event.description} (${event.status})`;
        await this.embedAndStore(userId, doc._id.toString(), 'HEALTH_EVENT', text, doc.date.toISOString());
        savedEvents++;
      } catch (err: any) {
        this.logger.error(`store healthEvent [${event.eventType}] error:`, err.message);
      }
    }

    // ── Save diet advice ──────────────────────────────────────────────────────
    let savedDiet = 0;
    for (const diet of parsedData?.dietAdvice ?? []) {
      try {
        const doc = await new this.dietLogModel({
          userId, description: diet.description,
          mealTypes: diet.mealTypes || [], source: 'DOCTOR', date: today,
        }).save();
        const text = `Doctor diet advice on ${doc.date.toISOString().slice(0, 10)}: ${diet.description}`;
        await this.embedAndStore(userId, doc._id.toString(), 'DIET_LOG', text, doc.date.toISOString());
        savedDiet++;
      } catch (err: any) {
        this.logger.error('storeDietLog error:', err.message);
      }
    }

    // ── Save lifestyle advice ─────────────────────────────────────────────────
    let savedLifestyle = 0;
    for (const ls of parsedData?.lifestyleAdvice ?? []) {
      try {
        const doc = await new this.lifestyleModel({
          userId, description: ls.description,
          categories: ls.categories || [], source: 'DOCTOR', date: today,
        }).save();
        const text = `Doctor lifestyle advice on ${doc.date.toISOString().slice(0, 10)}: ${ls.description}`;
        await this.embedAndStore(userId, doc._id.toString(), 'LIFESTYLE', text, doc.date.toISOString());
        savedLifestyle++;
      } catch (err: any) {
        this.logger.error('storeLifestyle error:', err.message);
      }
    }

    // ── Update user profile: append new conditions & medications ─────────────
    const newConditions  = (parsedData?.newConditions  ?? []).filter(Boolean);
    const newMedications = (parsedData?.newMedications ?? []).filter(Boolean);
    if (newConditions.length || newMedications.length) {
      try {
        const currentUser = await this.userService.findOne(userId);
        if (currentUser) {
          const mergedConditions = Array.from(new Set([
            ...(currentUser.medicalConditions ?? []),
            ...newConditions,
          ]));
          const mergedMedications = Array.from(new Set([
            ...(currentUser.medications ?? []),
            ...newMedications,
          ]));
          await this.userService.update(userId, {
            medicalConditions: mergedConditions,
            medications:       mergedMedications,
          });
        }
      } catch (err: any) {
        this.logger.warn('Failed to update user profile conditions/medications:', err.message);
      }
    }

    const total = savedEvents + savedDiet + savedLifestyle;
    if (total === 0) return '';

    const parts: string[] = [];
    if (savedEvents   > 0) parts.push(`${savedEvents} health record${savedEvents > 1 ? 's' : ''}`);
    if (savedDiet     > 0) parts.push(`${savedDiet} diet note${savedDiet > 1 ? 's' : ''}`);
    if (savedLifestyle > 0) parts.push(`${savedLifestyle} lifestyle tip${savedLifestyle > 1 ? 's' : ''}`);
    if (newConditions.length  > 0) parts.push(`${newConditions.length} condition${newConditions.length > 1 ? 's' : ''} added to your profile`);
    if (newMedications.length > 0) parts.push(`${newMedications.length} medication${newMedications.length > 1 ? 's' : ''} added to your profile`);

    return `Saved: ${parts.join(', ')}.`;
  }

  private _buildProfileText(p: UserProfileSnapshot): string {
    return (
      `Name: ${p.name} | Sex: ${p.biologicalSex || 'unknown'} | ` +
      `Conditions: ${p.medicalConditions?.join(', ') || 'None'} | ` +
      `Allergies: ${p.knownAllergies?.join(', ') || 'None'} | ` +
      `Medications: ${p.medications?.join(', ') || 'None'}`
    );
  }

  // ── Extract token string from a streamed chunk ────────────────────────────

  private _chunkText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return (content as any[])
        .filter(c => c.type === 'text')
        .map(c => c.text ?? '')
        .join('');
    }
    return '';
  }

  // ── Graph construction (per model) ────────────────────────────────────────

  private buildGraph(llm: BaseChatModel) {
    const graphBuilder = new StateGraph<AgentState>({
      channels: {
        userId:              null,
        userProfile:         null,
        message:             null,
        conversationHistory: {
          value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
          default: () => [],
        },
        intent:          null,
        retrievedContext: null,
        parsedData:      null,
        storageFeedback: {
          value: (_: string, y: string) => y,
          default: () => '',
        },
        response: null,
      }
    });

    const classifyIntent = async (state: AgentState): Promise<Partial<AgentState>> => {
      const intent = await this._classifyIntent(state.message, llm);
      return { intent };
    };

    const retrieveContext = async (state: AgentState): Promise<Partial<AgentState>> => {
      const retrievedContext = await this._retrieveContext(state.userId, state.message);
      return { retrievedContext };
    };

    const parseMedicalReport = async (state: AgentState): Promise<Partial<AgentState>> => {
      const parsedData = await this._parseMedicalReport(state.message, llm);
      return { parsedData };
    };

    const storeHealthEvents = async (state: AgentState): Promise<Partial<AgentState>> => {
      const events = state.parsedData?.healthEvents ?? [];
      for (const event of events) {
        try {
          const titles = event.titles?.length
            ? event.titles
            : [event.description?.slice(0, 60) || 'Health Event'];
          const doc = await new this.healthEventModel({
            ...event, titles, userId: state.userId, source: 'AI', date: new Date(),
          }).save();
          const text = `${event.eventType} on ${doc.date.toISOString().slice(0, 10)}: ` +
                       `${titles.join(', ')} — ${event.description} (${event.status})`;
          await this.embedAndStore(state.userId, doc._id.toString(), 'HEALTH_EVENT', text, doc.date.toISOString());
        } catch (err: any) {
          this.logger.error('storeHealthEvents error:', err.message);
        }
      }
      return events.length ? { storageFeedback: `Saved ${events.length} health record(s).` } : {};
    };

    const storeDietLogs = async (state: AgentState): Promise<Partial<AgentState>> => {
      const advice = state.parsedData?.dietAdvice ?? [];
      for (const diet of advice) {
        try {
          const doc = await new this.dietLogModel({
            userId: state.userId, description: diet.description,
            mealTypes: diet.mealTypes || [], source: 'DOCTOR', date: new Date(),
          }).save();
          const text = `Doctor diet advice on ${doc.date.toISOString().slice(0, 10)}: ${diet.description}`;
          await this.embedAndStore(state.userId, doc._id.toString(), 'DIET_LOG', text, doc.date.toISOString());
        } catch (err: any) {
          this.logger.error('storeDietLogs error:', err.message);
        }
      }
      return {};
    };

    const storeLifestyle = async (state: AgentState): Promise<Partial<AgentState>> => {
      const advice = state.parsedData?.lifestyleAdvice ?? [];
      for (const ls of advice) {
        try {
          const doc = await new this.lifestyleModel({
            userId: state.userId, description: ls.description,
            categories: ls.categories || [], source: 'DOCTOR', date: new Date(),
          }).save();
          const text = `Doctor lifestyle advice on ${doc.date.toISOString().slice(0, 10)}: ${ls.description}`;
          await this.embedAndStore(state.userId, doc._id.toString(), 'LIFESTYLE', text, doc.date.toISOString());
        } catch (err: any) {
          this.logger.error('storeLifestyle error:', err.message);
        }
      }

      // Update user profile with new conditions/medications extracted from report
      const newConditions  = (state.parsedData?.newConditions  ?? []).filter(Boolean);
      const newMedications = (state.parsedData?.newMedications ?? []).filter(Boolean);
      if (newConditions.length || newMedications.length) {
        try {
          const currentUser = await this.userService.findOne(state.userId);
          if (currentUser) {
            await this.userService.update(state.userId, {
              medicalConditions: Array.from(new Set([...(currentUser.medicalConditions ?? []), ...newConditions])),
              medications:       Array.from(new Set([...(currentUser.medications ?? []), ...newMedications])),
            });
          }
        } catch (err: any) {
          this.logger.warn('Failed to update user profile conditions/medications:', err.message);
        }
      }

      const totalStored =
        (state.parsedData?.healthEvents?.length ?? 0) +
        (state.parsedData?.dietAdvice?.length ?? 0) +
        advice.length;
      const parts: string[] = [`saved ${totalStored} record(s)`];
      if (newConditions.length)  parts.push(`${newConditions.length} condition(s) added to profile`);
      if (newMedications.length) parts.push(`${newMedications.length} medication(s) added to profile`);
      return {
        storageFeedback: `I've analysed your medical report and ${parts.join(', ')}.`
      };
    };

    const synthesizeResponse = async (state: AgentState): Promise<Partial<AgentState>> => {
      const profileText = this._buildProfileText(state.userProfile);
      const contextText = (state.retrievedContext || [])
        .map(c => `[${c.type}] ${c.text}`)
        .join('\n') || 'No relevant history found.';

      const history = (state.conversationHistory || []).slice(-6);
      const userMsg = state.storageFeedback
        ? `${state.message}\n\n[System note: ${state.storageFeedback}]`
        : state.message;

      const res = await llm.invoke([
        new SystemMessage(
          `You are a personal health advisor. Be concise and practical. ` +
          `Cite specific records when relevant.\n\n` +
          `PATIENT PROFILE:\n${profileText}\n\n` +
          `RELEVANT HEALTH HISTORY (semantic search):\n${contextText}`
        ),
        ...history,
        new HumanMessage(userMsg),
      ]);
      return { response: res.content as string };
    };

    const routeByIntent = (state: AgentState): string =>
      state.intent?.includes('MEDICAL_REPORT') ? 'parseMedicalReport' : 'synthesizeResponse';

    graphBuilder.addNode('classifyIntent',     classifyIntent);
    graphBuilder.addNode('retrieveContext',    retrieveContext);
    graphBuilder.addNode('parseMedicalReport', parseMedicalReport);
    graphBuilder.addNode('storeHealthEvents',  storeHealthEvents);
    graphBuilder.addNode('storeDietLogs',      storeDietLogs);
    graphBuilder.addNode('storeLifestyle',     storeLifestyle);
    graphBuilder.addNode('synthesizeResponse', synthesizeResponse);

    // @ts-ignore
    graphBuilder.addEdge(START, 'classifyIntent');
    // @ts-ignore
    graphBuilder.addEdge('classifyIntent', 'retrieveContext');
    // @ts-ignore
    graphBuilder.addConditionalEdges('retrieveContext', routeByIntent, {
      parseMedicalReport: 'parseMedicalReport',
      synthesizeResponse: 'synthesizeResponse',
    });
    // @ts-ignore
    graphBuilder.addEdge('parseMedicalReport', 'storeHealthEvents');
    // @ts-ignore
    graphBuilder.addEdge('storeHealthEvents',  'storeDietLogs');
    // @ts-ignore
    graphBuilder.addEdge('storeDietLogs',      'storeLifestyle');
    // @ts-ignore
    graphBuilder.addEdge('storeLifestyle',     'synthesizeResponse');
    // @ts-ignore
    graphBuilder.addEdge('synthesizeResponse', END);

    return graphBuilder.compile();
  }

  // ── File content extraction ───────────────────────────────────────────────

  async extractFileContent(buffer: Buffer, mimeType: string, modelId = DEFAULT_MODEL): Promise<string> {
    if (mimeType === 'application/pdf') {
      const parsed = await pdfParse(buffer);
      return parsed.text?.trim() || '';
    }

    if (mimeType.startsWith('image/')) {
      const llm = this.getLLM(modelId);
      const base64 = buffer.toString('base64');
      const imageContent: MessageContentImageUrl = {
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${base64}` },
      };
      const res = await llm.invoke([
        new HumanMessage({
          content: [
            imageContent,
            {
              type: 'text',
              text:
                'This is a medical document (scan report, prescription, lab result, or doctor notes). ' +
                'Extract ALL medical information completely and accurately: diagnoses, conditions, medications ' +
                'with dosages and frequencies, test results with values and reference ranges, doctor instructions, ' +
                'recommendations, patient name if visible, and report date. ' +
                'Present everything in clear structured text.',
            },
          ],
        }),
      ]);
      return res.content as string;
    }

    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  private _buildUserProfile(userDetails: any): UserProfileSnapshot {
    return {
      name:              userDetails.name || 'User',
      knownAllergies:    userDetails.knownAllergies || userDetails.allergies || [],
      medicalConditions: userDetails.medicalConditions || [],
      medications:       userDetails.medications || [],
      biologicalSex:     userDetails.biologicalSex,
      bloodType:         userDetails.baseMetrics?.bloodType,
    };
  }

  async chat(
    userId: string,
    userDetails: any,
    message: string,
    history: BaseMessage[],
    modelId = DEFAULT_MODEL
  ) {
    const userProfile = this._buildUserProfile(userDetails);

    const finalState: AgentState = await this.getGraph(modelId).invoke({
      userId,
      userProfile,
      message,
      conversationHistory: history,
      intent:          [],
      retrievedContext: [],
      parsedData:      null,
      storageFeedback: '',
      response:        '',
    });

    return {
      reply:          finalState.response,
      intent:         finalState.intent,
      retrievedCount: (finalState.retrievedContext || []).length,
      stored:         !!finalState.storageFeedback,
      model:          modelId,
    };
  }

  // ── Streaming API ──────────────────────────────────────────────────────────

  async chatStream(
    userId: string,
    userDetails: any,
    message: string,
    history: BaseMessage[],
    sendEvent: (event: string, data: unknown) => void,
    modelId = DEFAULT_MODEL
  ): Promise<void> {
    const llm = this.getLLM(modelId);
    const userProfile = this._buildUserProfile(userDetails);

    sendEvent('node', { label: 'Classifying intent...' });
    const intent = await this._classifyIntent(message, llm);
    sendEvent('intent', { intent });

    sendEvent('node', { label: 'Searching health history...' });
    const retrievedContext = await this._retrieveContext(userId, message);
    sendEvent('node', {
      label: `Found ${retrievedContext.length} relevant record${retrievedContext.length !== 1 ? 's' : ''}`,
    });

    let storageFeedback = '';
    if (intent.includes('MEDICAL_REPORT')) {
      sendEvent('node', { label: 'Parsing medical report...' });
      const parsedData = await this._parseMedicalReport(message, llm);
      sendEvent('node', { label: 'Saving records to your profile...' });
      storageFeedback = await this._storeReport(userId, parsedData);
      if (storageFeedback) sendEvent('node', { label: storageFeedback });
    }

    sendEvent('node', { label: 'Generating response...' });

    const profileText = this._buildProfileText(userProfile);
    const contextText = retrievedContext
      .map(c => `[${c.type}] ${c.text}`)
      .join('\n') || 'No relevant history found.';

    const userMsg = storageFeedback
      ? `${message}\n\n[System note: ${storageFeedback}]`
      : message;

    const stream = await llm.stream([
      new SystemMessage(
        `You are a personal health advisor. Be concise and practical. ` +
        `Cite specific records when relevant.\n\n` +
        `PATIENT PROFILE:\n${profileText}\n\n` +
        `RELEVANT HEALTH HISTORY (semantic search):\n${contextText}`
      ),
      ...history.slice(-6),
      new HumanMessage(userMsg),
    ]);

    for await (const chunk of stream) {
      const token = this._chunkText(chunk.content);
      if (token) sendEvent('token', { token });
    }

    sendEvent('done', {
      intent,
      retrievedCount: retrievedContext.length,
      stored: !!storageFeedback,
      model: modelId,
    });
  }

  async generateHealthPlan(userId: string, userDetails: any, healthRecords: any[], dietLogs: any[]) {
    const llm = this.getLLM(DEFAULT_MODEL);
    const contextStr = [
      `Name: ${userDetails.name}`,
      `Allergies: ${(userDetails.knownAllergies || userDetails.allergies || []).join(', ') || 'None'}`,
      `Conditions: ${(userDetails.medicalConditions || []).join(', ') || 'None'}`,
      `Recent records: ${healthRecords.slice(0, 5).map((r: any) => (r.titles || []).join(', ')).join(' | ')}`,
      `Recent diet: ${dietLogs.slice(0, 3).map((d: any) => d.description || '').join(' | ')}`,
    ].join('\n');

    type PlanState = { context: string; suggestions: string[]; mealPlan: string[] };
    const graphBuilder = new StateGraph<PlanState>({
      channels: { context: null, suggestions: null, mealPlan: null }
    });

    graphBuilder.addNode('analyzeHealth', async (state: PlanState) => {
      const res = await llm.invoke([
        new SystemMessage('You are a health advisor. Provide 2-3 specific health suggestions.'),
        new HumanMessage(`User Context:\n${state.context}`)
      ]);
      return { suggestions: [res.content as string] };
    });

    graphBuilder.addNode('generateMealPlan', async (state: PlanState) => {
      const res = await llm.invoke([
        new SystemMessage('You are a nutritionist. Create a 1-day meal plan as bullet points.'),
        new HumanMessage(`User Context:\n${state.context}\nSuggestions:\n${state.suggestions.join('\n')}`)
      ]);
      return { mealPlan: [res.content as string] };
    });

    // @ts-ignore
    graphBuilder.addEdge(START, 'analyzeHealth');
    // @ts-ignore
    graphBuilder.addEdge('analyzeHealth', 'generateMealPlan');
    // @ts-ignore
    graphBuilder.addEdge('generateMealPlan', END);

    const result = await graphBuilder.compile().invoke({
      context: contextStr, suggestions: [], mealPlan: []
    });
    return { suggestions: result.suggestions, mealPlan: result.mealPlan };
  }

  async processAndEmbedNode(label: 'Ingredient' | 'Disease', name: string, description: string) {
    const driver = this.neo4jService.getDriver();
    if (!driver) return;
    try {
      const vector = await this.embeddings.embedQuery(description);
      const session = driver.session();
      await session.run(
        `MERGE (n:${label} {name: $name})
         SET n.description = $description, n.embedding = $vector`,
        { name, description, vector }
      );
      await session.close();
    } catch (error: any) {
      this.logger.error(`Failed to embed ${name}:`, error.message);
    }
  }
}
