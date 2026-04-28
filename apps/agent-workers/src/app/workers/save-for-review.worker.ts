import { Injectable, Logger } from '@nestjs/common';
import { CamundaWorker, Worker, HandlerArgs } from '@work-bench/camunda-worker';
import { StreamerClientService } from '../services/streamer-client.service';

@Injectable()
@Worker('saveForReview')
export class SaveForReviewWorker extends CamundaWorker {
  constructor(
    protected readonly logger: Logger,
    private readonly streamer: StreamerClientService,
  ) {
    super();
  }

  async run({ task, taskService }: HandlerArgs): Promise<void> {
    const sessionId        = task.variables.get('sessionId') as string;
    const userId           = task.variables.get('userId') as string;
    const processedContent = task.variables.get('processedContent') as string;

    await this.streamer.pushStep(sessionId, 'Saving your message for review...', 'processing');

    // Others path: BPMN routes to TerminateEnd after this task — no StartAiSuggestions.
    // Push the done event directly so the SSE stream closes with a response.
    const reply =
      "I've received your message. It doesn't appear to be a health record, diet log, or lifestyle note, " +
      "so I've saved it for review. If you have a specific health question, feel free to ask and I'll do my best to help!";

    await this.streamer.pushEvent(sessionId, {
      type: 'done',
      content: reply,
      intent: ['OTHERS'],
      userId,
    });

    await this.streamer.pushStep(sessionId, 'Saving your message for review...', 'done');
    await this.completeTask(taskService, task);
  }
}
