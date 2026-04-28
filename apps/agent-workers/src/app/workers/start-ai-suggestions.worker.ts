import { Injectable, Logger } from '@nestjs/common';
import { CamundaWorker, Worker, HandlerArgs } from '@work-bench/camunda-worker';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { StreamerClientService } from '../services/streamer-client.service';
import { LlmService } from '../services/llm.service';

@Injectable()
@Worker('startAiSuggestions')
export class StartAiSuggestionsWorker extends CamundaWorker {
  constructor(
    protected readonly logger: Logger,
    private readonly streamer: StreamerClientService,
    private readonly llmService: LlmService,
  ) {
    super();
  }

  async run({ task, taskService }: HandlerArgs): Promise<void> {
    const sessionId        = task.variables.get('sessionId') as string;
    const userId           = task.variables.get('userId') as string;
    const userMessage      = task.variables.get('userMessage') as string;
    const intent           = (task.variables.get('intent') as string) ?? 'OTHERS';
    const userDetailsJson  = (task.variables.get('userDetailsJson') as string) ?? '{}';
    const processedContent = task.variables.get('processedContent') as string ?? userMessage;
    const modelId          = task.variables.get('modelId') as string | undefined;

    const extractedHealthDataJson = task.variables.get('extractedHealthDataJson') as string | undefined;
    const analyzedDietJson        = task.variables.get('analyzedDietJson') as string | undefined;
    const analyzedLifestyleJson   = task.variables.get('analyzedLifestyleJson') as string | undefined;

    await this.streamer.pushStep(sessionId, 'Generating AI response...', 'processing');

    let userDetails: Record<string, unknown> = {};
    try { userDetails = JSON.parse(userDetailsJson); } catch { /* skip */ }

    const profileText =
      `Name: ${userDetails['name'] ?? 'Unknown'} | ` +
      `Conditions: ${(userDetails['medicalConditions'] as string[] | undefined)?.join(', ') || 'None'} | ` +
      `Allergies: ${(userDetails['knownAllergies'] as string[] | undefined)?.join(', ') || 'None'} | ` +
      `Medications: ${(userDetails['medications'] as string[] | undefined)?.join(', ') || 'None'}`;

    const contextParts: string[] = [];
    if (extractedHealthDataJson) {
      try {
        const d = JSON.parse(extractedHealthDataJson);
        contextParts.push(`Health report summary: ${JSON.stringify(d['visitSummary'] ?? {})}`);
      } catch { /* skip */ }
    }
    if (analyzedDietJson) {
      try {
        const d = JSON.parse(analyzedDietJson);
        contextParts.push(`Diet analysis: ${d['description'] ?? ''}`);
      } catch { /* skip */ }
    }
    if (analyzedLifestyleJson) {
      try {
        const d = JSON.parse(analyzedLifestyleJson);
        contextParts.push(`Lifestyle: ${d['description'] ?? ''}`);
      } catch { /* skip */ }
    }

    const systemPrompt =
      `You are a personal health advisor. Be concise, practical, and supportive. ` +
      `Cite specific records when relevant.\n\n` +
      `PATIENT PROFILE:\n${profileText}` +
      (contextParts.length > 0 ? `\n\nRECENT DATA:\n${contextParts.join('\n')}` : '');

    const llm = this.llmService.getLLM(modelId);

    let fullResponse = '';
    try {
      const stream = await llm.stream([
        new SystemMessage(systemPrompt),
        new HumanMessage(processedContent),
      ]);

      for await (const chunk of stream) {
        const token = this.llmService.chunkText(chunk.content);
        if (token) {
          fullResponse += token;
          await this.streamer.pushEvent(sessionId, { type: 'token', content: token });
        }
      }
    } catch (err: unknown) {
      this.logger.error('StartAiSuggestions: LLM stream failed', (err as Error).message);
      await this.streamer.pushEvent(sessionId, {
        type: 'error',
        error: 'AI response generation failed. Please try again.',
      });
      await this.completeTask(taskService, task);
      return;
    }

    await this.streamer.pushEvent(sessionId, {
      type:    'done',
      content: fullResponse,
      intent:  [intent],
      userId,
    });

    await this.completeTask(taskService, task);
  }
}
