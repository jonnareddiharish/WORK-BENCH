import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
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

interface DoctorInfo {
  name?: string;
  hospital?: string;
  address?: string;
  specialty?: string;
}

interface MedicationItem {
  name: string;
  dosage: string;
  frequency: string;
  duration?: string;
  route: string;        // ORAL | INJECTION | TOPICAL | IV | OTHER
  isDaily: boolean;     // tablets/tonics taken at home → also added to diet
  instructions?: string;
}

interface TestItem {
  testName: string;
  value?: string;
  referenceRange?: string;
  interpretation?: string;
  status: string;       // NORMAL | ABNORMAL | BORDERLINE
}

// ONE diet card per meal-timing slot — bundles all instructions for that timing
interface DietSlot {
  timing: string;      // BEFORE_BREAKFAST | WITH_BREAKFAST | AFTER_BREAKFAST | BEFORE_LUNCH | WITH_LUNCH | AFTER_LUNCH | BEFORE_DINNER | WITH_DINNER | AFTER_DINNER | MORNING | EVENING | GENERAL
  mealTypes: string[]; // BREAKFAST | LUNCH | DINNER | SNACK | PILLS — used as DB tags
  items: string[];     // each individual instruction/medication for this timing slot
  period?: string;     // how long to follow (e.g. "30 days", "2 weeks", "ongoing")
}

interface ParsedHealthData {
  visitDate?: string;
  doctorInfo?: DoctorInfo;
  // ONE card: all diagnoses from this visit
  visitSummary?: {
    description: string;
    conditions: string[];
    symptoms?: string[];
    injections?: string[];  // given at the visit, NOT for home use
    notes?: string;
    status: string;
  };
  // ONE card: all prescribed medications
  prescriptions?: {
    items: MedicationItem[];
    status: string;
  };
  // ONE card: all test results
  testResults?: {
    items: TestItem[];
    status: string;
  };
  // ONE DietLog per timing slot (grouped by meal period)
  dietAdvice?: DietSlot[];
  // ONE Lifestyle record total — all items merged
  lifestyleAdvice?: { description: string; categories: string[] }[];
  newConditions?: string[];
  newMedications?: string[];
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

  // ── Public embedding utilities ─────────────────────────────────────────────

  async deleteEmbedding(sourceId: string): Promise<void> {
    const driver = this.neo4jService.getDriver();
    if (!driver) return;
    const session = driver.session();
    try {
      await session.run(
        `MATCH (c:UserHealthChunk {id: $sourceId}) DETACH DELETE c`,
        { sourceId }
      );
    } catch (err: any) {
      this.logger.warn(`deleteEmbedding failed [${sourceId}]: ${err.message}`);
    } finally {
      await session.close();
    }
  }

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
    const systemPrompt = [
      'You are a medical data extraction system. Extract ALL information from the medical report.',
      'Return ONLY a valid JSON object — no prose, no markdown fences, nothing else.\n',
      'Required JSON shape:',
      '{',
      '  "visitDate": "<ISO date string or null>",',
      '  "doctorInfo": { "name": "<doctor name>", "hospital": "<hospital name>", "address": "<clinic/hospital address>", "specialty": "<specialty>" },',
      '  "visitSummary": {',
      '    "description": "<1-2 sentence summary of the visit/procedure>",',
      '    "conditions": ["<each diagnosis or finding>"],',
      '    "symptoms": ["<each symptom reported>"],',
      '    "injections": ["<injection name + dose if administered at visit>"],',
      '    "notes": "<key clinical findings and doctor notes>",',
      '    "status": "ACTIVE"',
      '  },',
      '  "prescriptions": {',
      '    "items": [',
      '      { "name": "<drug name>", "dosage": "<dose>", "frequency": "<e.g. 1-0-0-1>", "duration": "<e.g. 30 days>",',
      '        "route": "<ORAL|INJECTION|TOPICAL|IV|OTHER>",',
      '        "isDaily": <true if patient takes at home daily>,',
      '        "instructions": "<e.g. before meals, with water>" }',
      '    ],',
      '    "status": "ACTIVE"',
      '  },',
      '  "testResults": {',
      '    "items": [',
      '      { "testName": "<test name>", "value": "<result>", "referenceRange": "<ref range>",',
      '        "interpretation": "<what it means>", "status": "<NORMAL|ABNORMAL|BORDERLINE>" }',
      '    ],',
      '    "status": "ACTIVE"',
      '  },',
      '',
      '  "dietAdvice": [',
      '    IMPORTANT: Group ALL diet-related instructions by MEAL TIMING into slots.',
      '    Each slot = ONE card. Do NOT create one item per medication — bundle all medications/advice for the same timing into one slot.',
      '    Timing options: BEFORE_BREAKFAST | WITH_BREAKFAST | AFTER_BREAKFAST | BEFORE_LUNCH | WITH_LUNCH | AFTER_LUNCH | BEFORE_DINNER | WITH_DINNER | AFTER_DINNER | MORNING | EVENING | GENERAL',
      '    mealTypes tag options: BREAKFAST | LUNCH | DINNER | SNACK | PILLS (use PILLS when slot contains medications)',
      '    {',
      '      "timing": "<timing key from above>",',
      '      "mealTypes": ["<BREAKFAST|LUNCH|DINNER|SNACK|PILLS>"],',
      '      "items": ["<drug name + dose + instruction>", "<another instruction for same timing>"],',
      '      "period": "<duration e.g. 30 days | 2 weeks | ongoing>"',
      '    }',
      '  ],',
      '',
      '  "lifestyleAdvice": [',
      '    { "description": "<ONE lifestyle instruction>", "categories": ["<EXERCISE|SLEEP|STRESS|GENERAL|DIET>"] }',
      '  ],',
      '  "newConditions": ["<each diagnosis as plain string>"],',
      '  "newMedications": ["<medication name + dose as plain string>"]',
      '}',
      '',
      'DIET GROUPING RULES (critical):',
      '- Group medications AND food advice by when they are taken relative to meals.',
      '  Example: All drugs taken 30 mins BEFORE breakfast → one BEFORE_BREAKFAST slot.',
      '  Example: All drugs taken AFTER lunch → one AFTER_LUNCH slot.',
      '  Example: General dietary restrictions (avoid coffee, eat small meals) → one GENERAL slot.',
      '- A single slot may contain multiple medications AND food instructions if they share the same timing.',
      '- Do NOT create a separate slot per medication — bundle everything for the same meal timing.',
      '- If a drug has timing "1-0-0-1" (morning + night), split into BEFORE_BREAKFAST and BEFORE_DINNER slots.',
      '- Include the drug name, dosage, and timing instruction in each items[] entry.',
      '',
      'OTHER RULES:',
      '- isDaily=true for tablets, capsules, tonics, syrups (taken at home); isDaily=false for hospital injections/IV',
      '- Injections given AT the clinic/hospital go in visitSummary.injections only, NOT in prescriptions',
      '- Omit "visitSummary", "prescriptions", or "testResults" keys entirely if not present in the report',
      '- All arrays must be non-empty if the key is present',
    ].join('\n');

    try {
      const res = await llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(message),
      ]);
      const parsed = this._extractJson(res.content as string);
      this.logger.log(
        `parseMedicalReport: ${parsed.visitSummary?.conditions?.length ?? 0} conditions, ` +
        `${parsed.prescriptions?.items?.length ?? 0} medications, ` +
        `${parsed.testResults?.items?.length ?? 0} tests`
      );
      return parsed;
    } catch (err: any) {
      this.logger.error('parseMedicalReport failed:', err.message);
      return {};
    }
  }

  private async _storeReport(userId: string, parsedData: ParsedHealthData): Promise<string> {
    const today = new Date();
    const reportGroupId = randomUUID();
    const doctorName = parsedData.doctorInfo?.name;
    const dateStr = (parsedData.visitDate ? new Date(parsedData.visitDate) : today)
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const reportLabel = doctorName ? `${doctorName} · ${dateStr}` : dateStr;
    let savedCards = 0;
    let dietSlotsSaved = 0;

    // ── ONE DOCTOR_VISIT card — all diagnoses bundled ─────────────────────────
    if (parsedData.visitSummary) {
      const vs = parsedData.visitSummary;
      const conditionTitle = vs.conditions?.length
        ? vs.conditions.join(', ').slice(0, 80)
        : 'Visit Summary';
      try {
        const doc = await new this.healthEventModel({
          eventType:   'DOCTOR_VISIT',
          titles:      [conditionTitle],
          description: vs.description || conditionTitle,
          status:      vs.status || 'ACTIVE',
          details: {
            doctorInfo: parsedData.doctorInfo ?? {},
            conditions: vs.conditions  ?? [],
            symptoms:   vs.symptoms    ?? [],
            injections: vs.injections  ?? [],
            notes:      vs.notes       ?? '',
          },
          userId, source: 'DOCTOR', date: today, reportGroupId,
        }).save();
        await this.embedAndStore(
          userId, doc._id.toString(), 'HEALTH_EVENT',
          `DOCTOR_VISIT on ${doc.date.toISOString().slice(0, 10)}: ${conditionTitle}`,
          doc.date.toISOString()
        );
        savedCards++;
      } catch (err: any) {
        this.logger.error('store DOCTOR_VISIT error:', err.message);
      }
    }

    // ── ONE PRESCRIPTION card — all medications bundled ───────────────────────
    if (parsedData.prescriptions?.items?.length) {
      const meds = parsedData.prescriptions.items;
      const medTitle = 'Prescription — ' + meds.map(m => m.name).join(', ').slice(0, 60);
      try {
        const doc = await new this.healthEventModel({
          eventType:   'PRESCRIPTION',
          titles:      [medTitle],
          description: `${meds.length} medication(s) prescribed`,
          status:      parsedData.prescriptions.status || 'ACTIVE',
          details: {
            doctorInfo:  parsedData.doctorInfo ?? {},
            medications: meds,
          },
          userId, source: 'DOCTOR', date: today, reportGroupId,
        }).save();
        await this.embedAndStore(
          userId, doc._id.toString(), 'HEALTH_EVENT',
          `PRESCRIPTION on ${doc.date.toISOString().slice(0, 10)}: ${medTitle}`,
          doc.date.toISOString()
        );
        savedCards++;
      } catch (err: any) {
        this.logger.error('store PRESCRIPTION error:', err.message);
      }
    }

    // ── ONE TEST_RESULTS card — all tests bundled ─────────────────────────────
    if (parsedData.testResults?.items?.length) {
      const tests = parsedData.testResults.items;
      const testTitle = 'Tests — ' + tests.map(t => t.testName).join(', ').slice(0, 60);
      try {
        const doc = await new this.healthEventModel({
          eventType:   'TEST_RESULTS',
          titles:      [testTitle],
          description: `${tests.length} test result(s)`,
          status:      parsedData.testResults.status || 'ACTIVE',
          details:     { testResults: tests },
          userId, source: 'DOCTOR', date: today, reportGroupId,
        }).save();
        await this.embedAndStore(
          userId, doc._id.toString(), 'HEALTH_EVENT',
          `TEST_RESULTS on ${doc.date.toISOString().slice(0, 10)}: ${testTitle}`,
          doc.date.toISOString()
        );
        savedCards++;
      } catch (err: any) {
        this.logger.error('store TEST_RESULTS error:', err.message);
      }
    }

    // ── Diet advice — ONE card per timing slot ────────────────────────────────
    for (const slot of parsedData.dietAdvice ?? []) {
      if (!slot.items?.length) continue;
      try {
        const timingLabel = slot.timing?.replace(/_/g, ' ') ?? 'General';
        const periodSuffix = slot.period ? ` (${slot.period})` : '';
        const description = `${timingLabel}${periodSuffix}:\n${slot.items.map(i => `• ${i}`).join('\n')}`;
        const doc = await new this.dietLogModel({
          userId,
          description,
          mealTypes: slot.mealTypes?.length ? slot.mealTypes : ['GENERAL'],
          source: 'DOCTOR',
          date: today,
          reportGroupId,
          reportLabel,
        }).save();
        await this.embedAndStore(
          userId, doc._id.toString(), 'DIET_LOG',
          `Doctor diet advice on ${doc.date.toISOString().slice(0, 10)} [${timingLabel}]: ${slot.items.join('; ')}`,
          doc.date.toISOString()
        );
        dietSlotsSaved++;
      } catch (err: any) {
        this.logger.error('storeDietLog error:', err.message);
      }
    }

    // ── Lifestyle advice — ONE bundled record for the whole report ─────────────
    const allLifestyle = parsedData.lifestyleAdvice ?? [];
    if (allLifestyle.length > 0) {
      try {
        const allCategories = Array.from(new Set(allLifestyle.flatMap(ls => ls.categories || [])));
        const combinedDesc = allLifestyle.map(ls => `• ${ls.description}`).join('\n');
        const doc = await new this.lifestyleModel({
          userId,
          description: combinedDesc,
          categories: allCategories.length ? allCategories : ['GENERAL'],
          source: 'DOCTOR',
          date: today,
          reportGroupId,
          reportLabel,
        }).save();
        await this.embedAndStore(
          userId, doc._id.toString(), 'LIFESTYLE',
          `Doctor lifestyle advice on ${doc.date.toISOString().slice(0, 10)}: ${combinedDesc.slice(0, 200)}`,
          doc.date.toISOString()
        );
      } catch (err: any) {
        this.logger.error('storeLifestyle error:', err.message);
      }
    }

    // ── Update user profile ───────────────────────────────────────────────────
    const newConditions  = (parsedData.newConditions  ?? []).filter(Boolean);
    const newMedications = (parsedData.newMedications ?? []).filter(Boolean);
    if (newConditions.length || newMedications.length) {
      try {
        const currentUser = await this.userService.findOne(userId);
        if (currentUser) {
          await this.userService.update(userId, {
            medicalConditions: Array.from(new Set([...(currentUser.medicalConditions ?? []), ...newConditions])),
            medications:       Array.from(new Set([...(currentUser.medications ?? []), ...newMedications])),
          });
        }
      } catch (err: any) {
        this.logger.warn('Failed to update user profile:', err.message);
      }
    }

    const lifestyleSaved = (parsedData.lifestyleAdvice ?? []).length > 0;
    if (savedCards === 0 && dietSlotsSaved === 0 && !lifestyleSaved) return '';
    const parts: string[] = [];
    if (savedCards > 0)    parts.push(`${savedCards} health record card${savedCards > 1 ? 's' : ''} saved`);
    if (dietSlotsSaved > 0) parts.push(`${dietSlotsSaved} diet schedule card${dietSlotsSaved > 1 ? 's' : ''} added`);
    if (lifestyleSaved) parts.push('lifestyle advice saved');
    if (newConditions.length)  parts.push(`${newConditions.length} condition${newConditions.length > 1 ? 's' : ''} added to profile`);
    if (newMedications.length) parts.push(`${newMedications.length} medication${newMedications.length > 1 ? 's' : ''} added to profile`);
    return parts.join(', ') + '.';
  }

  // ── Re-analysis after manual edit ─────────────────────────────────────────

  private _computeEventDiff(oldEvent: any, newEvent: any) {
    const oldConditions: string[] = oldEvent.details?.conditions ?? [];
    const newConditions: string[] = newEvent.details?.conditions ?? [];
    const conditionsAdded   = newConditions.filter(c => !oldConditions.includes(c));
    const conditionsRemoved = oldConditions.filter(c => !newConditions.includes(c));

    const oldMedNames: string[] = (oldEvent.details?.medications ?? []).map((m: any) => m.name);
    const newMedNames: string[] = (newEvent.details?.medications ?? []).map((m: any) => m.name);
    const medicationsAdded   = newMedNames.filter(m => !oldMedNames.includes(m));
    const medicationsRemoved = oldMedNames.filter(m => !newMedNames.includes(m));

    const oldTests: any[] = oldEvent.details?.testResults ?? [];
    const newTests: any[] = newEvent.details?.testResults ?? [];
    const statusChanges = newTests
      .filter(nt => {
        const ot = oldTests.find(t => t.testName === nt.testName);
        return ot && ot.status !== nt.status;
      })
      .map(nt => {
        const ot = oldTests.find(t => t.testName === nt.testName);
        return `${nt.testName}: ${ot.status} → ${nt.status}`;
      });

    const descriptionChanged = (oldEvent.description ?? '') !== (newEvent.description ?? '');
    const statusChanged      = (oldEvent.status ?? '') !== (newEvent.status ?? '');

    const hasChanges =
      conditionsAdded.length > 0 || conditionsRemoved.length > 0 ||
      medicationsAdded.length > 0 || medicationsRemoved.length > 0 ||
      statusChanges.length > 0 || descriptionChanged || statusChanged;

    return {
      hasChanges, conditionsAdded, conditionsRemoved,
      medicationsAdded, medicationsRemoved, statusChanges,
      descriptionChanged, statusChanged,
    };
  }

  private _buildDiffPrompt(diff: ReturnType<AgentService['_computeEventDiff']>, oldEvent: any, newEvent: any): string {
    const lines = [
      `Health record type: ${newEvent.eventType}`,
      `Record date: ${new Date(newEvent.date).toISOString().slice(0, 10)}`,
      '',
      'Manual corrections made:',
    ];
    if (diff.conditionsAdded.length)   lines.push(`- CONDITIONS ADDED: ${diff.conditionsAdded.join(', ')}`);
    if (diff.conditionsRemoved.length) lines.push(`- CONDITIONS REMOVED: ${diff.conditionsRemoved.join(', ')}`);
    if (diff.medicationsAdded.length)  lines.push(`- MEDICATIONS ADDED: ${diff.medicationsAdded.join(', ')}`);
    if (diff.medicationsRemoved.length)lines.push(`- MEDICATIONS REMOVED: ${diff.medicationsRemoved.join(', ')}`);
    if (diff.statusChanges.length)     lines.push(`- TEST STATUS CHANGES: ${diff.statusChanges.join('; ')}`);
    if (diff.descriptionChanged)
      lines.push(`- DESCRIPTION changed: "${oldEvent.description}" → "${newEvent.description}"`);
    if (diff.statusChanged)
      lines.push(`- RECORD STATUS changed: ${oldEvent.status} → ${newEvent.status}`);
    lines.push('', 'Are these corrections clinically significant? Provide a brief actionable assessment (2-3 sentences).');
    return lines.join('\n');
  }

  async reanalyzeEventChanges(
    userId: string,
    oldEvent: any,
    newEvent: any,
    modelId = DEFAULT_MODEL
  ): Promise<{ analysis: string; profileUpdated: boolean }> {
    const diff = this._computeEventDiff(oldEvent, newEvent);
    if (!diff.hasChanges) {
      return { analysis: 'No significant changes detected.', profileUpdated: false };
    }

    const llm = this.getLLM(modelId);
    const prompt = this._buildDiffPrompt(diff, oldEvent, newEvent);
    let analysis = '';
    try {
      const res = await llm.invoke([
        new SystemMessage('You are a medical AI assistant reviewing corrections to a patient health record. Be concise and clinically focused.'),
        new HumanMessage(prompt),
      ]);
      analysis = res.content as string;
    } catch (err: any) {
      this.logger.error('reanalyzeEventChanges LLM call failed:', err.message);
      analysis = 'Analysis unavailable — record updated successfully.';
    }

    // Re-embed the updated record
    const eventText =
      `${newEvent.eventType} on ${new Date(newEvent.date).toISOString().slice(0, 10)}: ` +
      `${(newEvent.titles || []).join(', ')} — ${newEvent.description || ''} (${newEvent.status || ''})`;
    await this.embedAndStore(userId, newEvent._id.toString(), 'HEALTH_EVENT', eventText, new Date(newEvent.date).toISOString());

    // Update user profile if conditions/medications changed
    let profileUpdated = false;
    if (diff.conditionsAdded.length || diff.conditionsRemoved.length || diff.medicationsAdded.length) {
      try {
        const currentUser = await this.userService.findOne(userId);
        if (currentUser) {
          let conditions = [...(currentUser.medicalConditions ?? [])].filter(c => !diff.conditionsRemoved.includes(c));
          conditions = Array.from(new Set([...conditions, ...diff.conditionsAdded]));
          const medications = Array.from(new Set([...(currentUser.medications ?? []), ...diff.medicationsAdded]));
          await this.userService.update(userId, { medicalConditions: conditions, medications });
          profileUpdated = true;
        }
      } catch (err: any) {
        this.logger.warn('Failed to update user profile during reanalysis:', err.message);
      }
    }

    return { analysis, profileUpdated };
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

    const storeReportData = async (state: AgentState): Promise<Partial<AgentState>> => {
      if (!state.parsedData) return {};
      const feedback = await this._storeReport(state.userId, state.parsedData);
      return feedback ? { storageFeedback: feedback } : {};
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
    graphBuilder.addNode('storeReportData',    storeReportData);
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
    graphBuilder.addEdge('parseMedicalReport', 'storeReportData');
    // @ts-ignore
    graphBuilder.addEdge('storeReportData',    'synthesizeResponse');
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
