import { Injectable, Logger } from '@nestjs/common';
import { CamundaWorker, Worker, HandlerArgs } from '@work-bench/camunda-worker';
import { StreamerClientService } from '../services/streamer-client.service';
import { ApiClientService } from '../services/api-client.service';

@Injectable()
@Worker('getUserDetails')
export class GetUserDetailsWorker extends CamundaWorker {
  constructor(
    protected readonly logger: Logger,
    private readonly streamer: StreamerClientService,
    private readonly api: ApiClientService,
  ) {
    super();
  }

  async run({ task, taskService }: HandlerArgs): Promise<void> {
    this.logger.log('Running GetUserDetailsWorker for task ' + task.id);
    const sessionId = task.variables.get('sessionId') as string;
    const userId    = task.variables.get('userId') as string;

    await this.streamer.pushStep(sessionId, 'Fetching your health profile...', 'processing');

    let userDetailsJson = '{}';
    try {
      const data = await this.api.get(`/users/${userId}`);
      userDetailsJson = JSON.stringify(data);
    } catch (err: unknown) {
      this.logger.warn(`GetUserDetails: API call failed for user ${userId}: ${(err as Error).message}`);
    }

    await this.streamer.pushStep(sessionId, 'Fetching your health profile...', 'done');
    this.logger.log(`GetUserDetailsWorker completed for user ${userId}, userDetails: ${userDetailsJson}`);
    await this.completeTask(taskService, task, { userDetailsJson });
  }
}
