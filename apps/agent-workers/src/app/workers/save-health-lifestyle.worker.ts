import { Injectable, Logger } from '@nestjs/common';
import { CamundaWorker, Worker, HandlerArgs } from '@work-bench/camunda-worker';
import { StreamerClientService } from '../services/streamer-client.service';
import { ApiClientService } from '../services/api-client.service';

@Injectable()
@Worker('saveHealthLifestyle')
export class SaveHealthLifestyleWorker extends CamundaWorker {
  constructor(
    protected readonly logger: Logger,
    private readonly streamer: StreamerClientService,
    private readonly api: ApiClientService,
  ) {
    super();
  }

  async run({ task, taskService }: HandlerArgs): Promise<void> {
    const sessionId               = task.variables.get('sessionId') as string;
    const userId                  = task.variables.get('userId') as string;
    const extractedHealthDataJson = task.variables.get('extractedHealthDataJson') as string;

    await this.streamer.pushStep(sessionId, 'Saving lifestyle recommendations...', 'processing');

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(extractedHealthDataJson); } catch { /* skip */ }

    const adviceItems = (parsed['lifestyleAdvice'] as unknown[]) ?? [];

    if (adviceItems.length > 0) {
      await this.api.post(`/users/${userId}/lifestyle`, {
        source:      'AI',
        date:        parsed['visitDate'] ?? new Date().toISOString(),
        description: adviceItems.map((a: any) => a.description).join(' '),
        categories:  adviceItems.flatMap((a: any) => a.categories ?? []),
      });
    }

    await this.streamer.pushStep(sessionId, 'Saving lifestyle recommendations...', 'done');
    await this.completeTask(taskService, task);
  }
}
