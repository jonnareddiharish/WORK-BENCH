import { Injectable, Logger } from '@nestjs/common';
import { CamundaWorker, Worker, HandlerArgs } from '@work-bench/camunda-worker';
import { StreamerClientService } from '../services/streamer-client.service';
import { ApiClientService } from '../services/api-client.service';

@Injectable()
@Worker('saveHealthEvent')
export class SaveHealthEventWorker extends CamundaWorker {
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

    await this.streamer.pushStep(sessionId, 'Saving health records...', 'processing');

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(extractedHealthDataJson); } catch { /* skip */ }

    if (parsed['visitSummary']) {
      await this.api.post(`/users/${userId}/health-events`, {
        eventType:   'DOCTOR_VISIT',
        source:      'AI',
        date:        parsed['visitDate'] ?? new Date().toISOString(),
        description: (parsed['visitSummary'] as any)?.description ?? '',
        status:      (parsed['visitSummary'] as any)?.status ?? 'ACTIVE',
        details: {
          conditions:  (parsed['visitSummary'] as any)?.conditions ?? [],
          symptoms:    (parsed['visitSummary'] as any)?.symptoms ?? [],
          notes:       (parsed['visitSummary'] as any)?.notes ?? '',
          doctor:      parsed['doctorInfo'] ?? {},
          medications: (parsed['prescriptions'] as any)?.items ?? [],
        },
      });
    }

    await this.streamer.pushStep(sessionId, 'Saving health records...', 'done');
    await this.completeTask(taskService, task);
  }
}
