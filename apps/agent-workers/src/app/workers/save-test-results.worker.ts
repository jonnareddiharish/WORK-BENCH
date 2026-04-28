import { Injectable, Logger } from '@nestjs/common';
import { CamundaWorker, Worker, HandlerArgs } from '@work-bench/camunda-worker';
import { StreamerClientService } from '../services/streamer-client.service';
import { ApiClientService } from '../services/api-client.service';

@Injectable()
@Worker('saveTestResults')
export class SaveTestResultsWorker extends CamundaWorker {
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

    await this.streamer.pushStep(sessionId, 'Saving test results...', 'processing');

    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(extractedHealthDataJson); } catch { /* skip */ }

    const testResults = (parsed['testResults'] as any);

    if (testResults?.items?.length > 0) {
      await this.api.post(`/users/${userId}/health-events`, {
        eventType:   'LAB_TEST',
        source:      'AI',
        date:        parsed['visitDate'] ?? new Date().toISOString(),
        description: `Lab test results (${testResults.items.length} test${testResults.items.length > 1 ? 's' : ''})`,
        status:      testResults.status ?? 'ACTIVE',
        details:     { testResults: testResults.items },
      });
    }

    await this.streamer.pushStep(sessionId, 'Saving test results...', 'done');
    await this.completeTask(taskService, task);
  }
}
