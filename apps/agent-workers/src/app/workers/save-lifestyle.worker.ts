import { Injectable, Logger } from '@nestjs/common';
import { CamundaWorker, Worker, HandlerArgs } from '@work-bench/camunda-worker';
import { StreamerClientService } from '../services/streamer-client.service';
import { ApiClientService } from '../services/api-client.service';

@Injectable()
@Worker('saveLifestyle')
export class SaveLifestyleWorker extends CamundaWorker {
  constructor(
    protected readonly logger: Logger,
    private readonly streamer: StreamerClientService,
    private readonly api: ApiClientService,
  ) {
    super();
  }

  async run({ task, taskService }: HandlerArgs): Promise<void> {
    const sessionId             = task.variables.get('sessionId') as string;
    const userId                = task.variables.get('userId') as string;
    const analyzedLifestyleJson = task.variables.get('analyzedLifestyleJson') as string;

    await this.streamer.pushStep(sessionId, 'Saving lifestyle record...', 'processing');

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(analyzedLifestyleJson); } catch { /* skip */ }

    await this.api.post(`/users/${userId}/lifestyle`, {
      source: 'AI',
      date:   new Date().toISOString(),
      ...parsed,
    });

    await this.streamer.pushStep(sessionId, 'Saving lifestyle record...', 'done');
    await this.completeTask(taskService, task);
  }
}
