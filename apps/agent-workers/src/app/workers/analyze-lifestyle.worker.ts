import { Injectable, Logger } from '@nestjs/common';
import { CamundaWorker, Worker, HandlerArgs } from '@work-bench/camunda-worker';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { StreamerClientService } from '../services/streamer-client.service';
import { LlmService } from '../services/llm.service';

@Injectable()
@Worker('analyzeLifestyle')
export class AnalyzeLifestyleWorker extends CamundaWorker {
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
    const modelId          = task.variables.get('modelId') as string | undefined;

    await this.streamer.pushStep(sessionId, 'Analyzing lifestyle details...', 'processing');

    const llm = this.llmService.getLLM(modelId);
    const res = await llm.invoke([
      new SystemMessage(
        'You are a health advisor AI. Analyze the lifestyle note and return JSON: ' +
        '{ "description": "<brief summary>", "categories": ["EXERCISE"|"SLEEP"|"STRESS"|"HABITS"] }. ' +
        'Return ONLY valid JSON, no prose.',
      ),
      new HumanMessage(processedContent),
    ]);

    let analyzedLifestyleJson = '{}';
    try {
      let s = (res.content as string).replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/\s*```\s*$/m, '').trim();
      const start = s.indexOf('{'); const end = s.lastIndexOf('}');
      if (start !== -1 && end > start) s = s.slice(start, end + 1);
      analyzedLifestyleJson = JSON.stringify(JSON.parse(s));
    } catch {
      analyzedLifestyleJson = JSON.stringify({ description: processedContent, categories: [] });
    }

    await this.streamer.pushStep(sessionId, 'Analyzing lifestyle details...', 'done');
    await this.completeTask(taskService, task, { analyzedLifestyleJson });
  }
}
