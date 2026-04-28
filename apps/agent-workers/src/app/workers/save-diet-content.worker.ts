import { Injectable, Logger } from '@nestjs/common';
import { CamundaWorker, Worker, HandlerArgs } from '@work-bench/camunda-worker';
import { StreamerClientService } from '../services/streamer-client.service';
import { ApiClientService } from '../services/api-client.service';

@Injectable()
@Worker('saveDietContent')
export class SaveDietContentWorker extends CamundaWorker {
  constructor(
    protected readonly logger: Logger,
    private readonly streamer: StreamerClientService,
    private readonly api: ApiClientService,
  ) {
    super();
  }

  async run({ task, taskService }: HandlerArgs): Promise<void> {
    const sessionId        = task.variables.get('sessionId') as string;
    const userId           = task.variables.get('userId') as string;
    const analyzedDietJson = task.variables.get('analyzedDietJson') as string;

    await this.streamer.pushStep(sessionId, 'Saving diet log...', 'processing');

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(analyzedDietJson); } catch { /* skip */ }

    await this.api.post(`/users/${userId}/diet-logs`, {
      source: 'AI',
      date:   new Date().toISOString(),
      ...parsed,
    });

    await this.streamer.pushStep(sessionId, 'Saving diet log...', 'done');
    await this.completeTask(taskService, task);
  }
}
