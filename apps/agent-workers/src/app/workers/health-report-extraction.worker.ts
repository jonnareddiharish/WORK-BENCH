import { Injectable, Logger } from '@nestjs/common';
import { CamundaWorker, Worker, HandlerArgs } from '@work-bench/camunda-worker';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { StreamerClientService } from '../services/streamer-client.service';
import { LlmService } from '../services/llm.service';

const PARSE_SYSTEM_PROMPT = `You are a medical data extraction system. Extract ALL information from the medical report.
Return ONLY a valid JSON object — no prose, no markdown fences, nothing else.

Required JSON shape:
{
  "visitDate": "<ISO date string or null>",
  "doctorInfo": { "name": "<doctor name>", "hospital": "<hospital name>", "address": "<address>", "specialty": "<specialty>" },
  "visitSummary": {
    "description": "<1-2 sentence summary>",
    "conditions": ["<each diagnosis or finding>"],
    "symptoms": ["<each symptom reported>"],
    "injections": ["<injection name + dose if administered at visit>"],
    "notes": "<key clinical findings>",
    "status": "ACTIVE"
  },
  "prescriptions": {
    "items": [
      { "name": "<drug name>", "dosage": "<dose>", "frequency": "<e.g. 1-0-0-1>", "duration": "<e.g. 30 days>",
        "route": "<ORAL|INJECTION|TOPICAL|IV|OTHER>", "isDaily": <true/false>, "instructions": "<e.g. before meals>" }
    ],
    "status": "ACTIVE"
  },
  "testResults": {
    "items": [
      { "testName": "<test name>", "value": "<result>", "referenceRange": "<ref range>",
        "interpretation": "<interpretation>", "status": "<NORMAL|ABNORMAL|BORDERLINE>" }
    ],
    "status": "ACTIVE"
  },
  "dietAdvice": [
    {
      "cardType": "<MEDICATION|SUGGESTIONS|MANDATORY_FOOD>",
      "mealTypes": ["<PILLS|BREAKFAST|LUNCH|DINNER|SNACK>"],
      "medicationItems": [],
      "foodItems": [],
      "period": "<duration>"
    }
  ],
  "lifestyleAdvice": [{ "description": "<advice>", "categories": ["<EXERCISE|SLEEP|STRESS|HABITS>"] }],
  "nextAppointment": { "date": "<ISO date>", "description": "<reason>" },
  "followUpTests": ["<test name>"],
  "newConditions": ["<condition>"],
  "newMedications": ["<medication name>"]
}`;

@Injectable()
@Worker('extractHealthReport')
export class HealthReportExtractionWorker extends CamundaWorker {
  constructor(
    protected readonly logger: Logger,
    private readonly streamer: StreamerClientService,
    private readonly llmService: LlmService,
  ) {
    super();
  }

  async run({ task, taskService }: HandlerArgs): Promise<void> {
    const sessionId        = task.variables.get('sessionId') as string;
    const processedContent = task.variables.get('processedContent') as string;
    const userDetailsJson  = (task.variables.get('userDetailsJson') as string) ?? '{}';
    const modelId          = task.variables.get('modelId') as string | undefined;

    await this.streamer.pushStep(sessionId, 'Analyzing your health report...', 'processing');

    const userDetails = this.safeParseJson(userDetailsJson);
    const contextNote = userDetails?.['name']
      ? `Patient: ${userDetails['name']}. Known conditions: ${(userDetails['medicalConditions'] as string[] | undefined)?.join(', ') || 'none'}.`
      : '';

    const llm = this.llmService.getLLM(modelId);
    const res = await llm.invoke([
      new SystemMessage(PARSE_SYSTEM_PROMPT),
      new HumanMessage(contextNote ? `${contextNote}\n\n${processedContent}` : processedContent),
    ]);

    let extractedHealthDataJson = '{}';
    try {
      extractedHealthDataJson = JSON.stringify(this.extractJson(res.content as string));
    } catch {
      this.logger.warn('HealthReportExtraction: failed to parse LLM JSON, storing raw');
      extractedHealthDataJson = JSON.stringify({ raw: res.content });
    }

    await this.streamer.pushStep(sessionId, 'Analyzing your health report...', 'done');
    await this.completeTask(taskService, task, { extractedHealthDataJson });
  }

  private extractJson(text: string): unknown {
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

  private safeParseJson(json: string): Record<string, unknown> {
    try { return JSON.parse(json) as Record<string, unknown>; }
    catch { return {}; }
  }
}
