import { Injectable, Logger } from '@nestjs/common';
import { CamundaWorker, Worker, HandlerArgs } from '@work-bench/camunda-worker';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { StreamerClientService } from '../../services/streamer-client.service';
import { LlmService } from '../../services/llm.service';

@Injectable()
@Worker('analyzeDietContent')
export class AnalyzeDietContentWorker extends CamundaWorker {
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

    await this.streamer.pushStep(sessionId, 'Analyzing your diet entry...', 'processing');

    let userDetails: Record<string, unknown> = {};
    try { userDetails = JSON.parse(userDetailsJson); } catch { /* skip */ }

    const profileNote = userDetails?.['name']
      ? `Patient: ${userDetails['name']}. Allergies: ${(userDetails['knownAllergies'] as string[] | undefined)?.join(', ') || 'none'}.`
      : '';

    const llm = this.llmService.getLLM(modelId);
    const res = await llm.invoke([
      new SystemMessage(
        'You are a nutritionist AI. Analyze the diet log and return a JSON object with: ' +
        '{ "cardType": "SUGGESTIONS", "mealTypes": ["BREAKFAST"|"LUNCH"|"DINNER"|"SNACK"|"PILLS"], ' +
        '"foodItems": ["<item 1>", ...], "description": "<brief summary>", "date": "<ISO date or null>" }. ' +
        'Return ONLY valid JSON, no prose.',
      ),
      new HumanMessage(profileNote ? `${profileNote}\n\n${processedContent}` : processedContent),
    ]);

    let analyzedDietJson = '{}';
    try {
      let s = (res.content as string).replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/\s*```\s*$/m, '').trim();
      const start = s.indexOf('{'); const end = s.lastIndexOf('}');
      if (start !== -1 && end > start) s = s.slice(start, end + 1);
      analyzedDietJson = JSON.stringify(JSON.parse(s));
    } catch {
      analyzedDietJson = JSON.stringify({ description: processedContent });
    }

    await this.streamer.pushStep(sessionId, 'Analyzing your diet entry...', 'done');
    await this.completeTask(taskService, task, { analyzedDietJson });
  }
}
