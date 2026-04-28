import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CamundaWorker, type HandlerArgs, Worker } from '@work-bench/camunda-worker';

@Injectable()
@Worker('mealPlanGeneration')
export class MealPlanGenerationWorker extends CamundaWorker {
  constructor(
    protected readonly logger: Logger,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async run({ task, taskService }: HandlerArgs): Promise<void> {
    const userId = task.variables.get('userId') as string;
    const processInstanceId = task.processInstanceId;

    this.logger.log(`Generating meal plan for userId=${userId} process=${processInstanceId}`);

    // TODO: call AI meal plan service here
    // const mealPlan = await this.mealPlanService.generate(userId);

    await this.completeTask(taskService, task, { mealPlanGenerated: true });
  }
}
