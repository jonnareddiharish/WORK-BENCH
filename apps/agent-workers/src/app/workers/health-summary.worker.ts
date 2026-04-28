import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CamundaWorker, type HandlerArgs, Worker } from '@work-bench/camunda-worker';

@Injectable()
@Worker('healthSummaryAnalysis')
export class HealthSummaryWorker extends CamundaWorker {
  constructor(
    protected readonly logger: Logger,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async run({ task, taskService }: HandlerArgs): Promise<void> {
    const userId = task.variables.get('userId') as string;
    const processInstanceId = task.processInstanceId;

    this.logger.log(`Processing health summary for userId=${userId} process=${processInstanceId}`);

    // TODO: call AI health summary service here
    // const summary = await this.healthService.generateSummary(userId);

    await this.completeTask(taskService, task, { healthSummaryGenerated: true });
  }
}
