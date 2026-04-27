import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import {
  CAMUNDA_WORKERS_TOKEN,
  CamundaClientProvider,
  CamundaWorkersStartupService,
} from '@work-bench/camunda-worker';

import { HealthSummaryWorker } from './workers/health-summary.worker';
import { MealPlanGenerationWorker } from './workers/meal-plan-generation.worker';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
  ],
  providers: [
    Logger,
    CamundaClientProvider,
    HealthSummaryWorker,
    MealPlanGenerationWorker,
    {
      provide: CAMUNDA_WORKERS_TOKEN,
      useFactory: (
        healthSummary: HealthSummaryWorker,
        mealPlan: MealPlanGenerationWorker,
      ) => [healthSummary, mealPlan],
      inject: [HealthSummaryWorker, MealPlanGenerationWorker],
    },
    CamundaWorkersStartupService,
  ],
})
export class AppModule {}
