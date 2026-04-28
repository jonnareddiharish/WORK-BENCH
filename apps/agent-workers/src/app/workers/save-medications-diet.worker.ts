import { Injectable, Logger } from '@nestjs/common';
import { CamundaWorker, Worker, HandlerArgs } from '@work-bench/camunda-worker';
import { StreamerClientService } from '../services/streamer-client.service';
import { ApiClientService } from '../services/api-client.service';

@Injectable()
@Worker('saveMedicationsDiet')
export class SaveMedicationsDietWorker extends CamundaWorker {
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

    await this.streamer.pushStep(sessionId, 'Saving medication schedule...', 'processing');

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(extractedHealthDataJson); } catch { /* skip */ }

    const dietAdvice = (parsed['dietAdvice'] as unknown[]) ?? [];

    for (const slot of dietAdvice) {
      await this.api.post(`/users/${userId}/diet-logs`, {
        source: 'AI',
        date:   parsed['visitDate'] ?? new Date().toISOString(),
        ...(slot as Record<string, unknown>),
      });
    }

    await this.streamer.pushStep(sessionId, 'Saving medication schedule...', 'done');
    await this.completeTask(taskService, task);
  }
}
