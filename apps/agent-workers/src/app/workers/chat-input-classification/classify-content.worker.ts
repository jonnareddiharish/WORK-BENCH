import { Injectable, Logger } from '@nestjs/common';
import { CamundaWorker, Worker, HandlerArgs } from '@work-bench/camunda-worker';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
// pdf-parse index.js reads a test file at load time when module.parent is falsy (ESM/NX context).
// Import from the internal lib path to bypass that debug check.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse') as (buffer: Buffer, options?: Record<string, unknown>) => Promise<{ text: string }>;
import { StreamerClientService } from '../../services/streamer-client.service';
import { LlmService } from '../../services/llm.service';

const VALID_INTENTS = ['HEALTH_REPORT', 'DIET_LOGS', 'LIFESTYLE', 'OTHERS'] as const;
type Intent = typeof VALID_INTENTS[number];

@Injectable()
@Worker('classifyContent')
export class ClassifyContentWorker extends CamundaWorker {
  constructor(
    protected readonly logger: Logger,
    private readonly streamer: StreamerClientService,
    private readonly llmService: LlmService,
  ) {
    super();
  }

  async run({ task, taskService }: HandlerArgs): Promise<void> {
    const sessionId    = task.variables.get('sessionId') as string;
    const userMessage  = task.variables.get('userMessage') as string;
    const inputType    = (task.variables.get('inputType') as string) ?? 'TEXT';
    const fileBase64   = task.variables.get('fileBase64') as string | undefined;
    const fileMimeType = task.variables.get('fileMimeType') as string | undefined;
    const modelId      = task.variables.get('modelId') as string | undefined;

    await this.streamer.pushStep(sessionId, 'Understanding your message...', 'processing');

    let processedContent = userMessage;

    if (inputType !== 'TEXT' && fileBase64 && fileMimeType) {
      processedContent = await this.extractFileContent(fileBase64, fileMimeType, modelId);
    }

    const llm = this.llmService.getLLM(modelId);
    const res = await llm.invoke([
      new SystemMessage(
        'Classify the following health-related user message into exactly ONE category: ' +
        'HEALTH_REPORT (doctor report / lab results / prescriptions), ' +
        'DIET_LOGS (meal tracking / food diary / diet notes), ' +
        'LIFESTYLE (exercise, sleep, stress, habits), ' +
        'OTHERS (anything else). ' +
        'Return ONLY the category name, nothing else.',
      ),
      new HumanMessage(processedContent),
    ]);

    const raw   = (res.content as string).trim().toUpperCase();
    const intent: Intent = VALID_INTENTS.includes(raw as Intent) ? (raw as Intent) : 'OTHERS';

    await this.streamer.pushStep(sessionId, 'Understanding your message...', 'done');
    await this.completeTask(taskService, task, { processedContent, intent });
  }

  private async extractFileContent(
    fileBase64: string,
    mimeType: string,
    modelId?: string,
  ): Promise<string> {
    if (mimeType === 'application/pdf') {
      const buffer = Buffer.from(fileBase64, 'base64');
      const parsed = await pdfParse(buffer);
      return parsed.text?.trim() || '';
    }

    if (mimeType.startsWith('image/')) {
      const llm = this.llmService.getLLM(modelId);
      const res = await llm.invoke([
        new HumanMessage({
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileBase64}` } },
            {
              type: 'text',
              text:
                'This is a medical document. Extract ALL medical information completely and accurately: ' +
                'diagnoses, conditions, medications with dosages and frequencies, test results with values ' +
                'and reference ranges, doctor instructions, recommendations, patient name if visible, and report date. ' +
                'Present everything in clear structured text.',
            },
          ],
        }),
      ]);
      return res.content as string;
    }

    return '';
  }
}
