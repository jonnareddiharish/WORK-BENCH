import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { AppLoggerModule } from '@work-bench/commons';
import { CamundaClientProvider } from '@work-bench/camunda-worker';

// Shared services
import { LlmService } from './services/llm.service';
import { StreamerClientService } from './services/streamer-client.service';
import { ApiClientService } from './services/api-client.service';

// chat-input-processor BPMN workers (registered in main.ts via startMultipleWorkers)
import { GetUserDetailsWorker } from './workers/get-user-details.worker';
import { ClassifyContentWorker } from './workers/chat-input-classification/classify-content.worker';
import { AnalyzeDietContentWorker } from './workers/diet-logs/analyze-diet-content.worker';
import { SaveDietContentWorker } from './workers/save-diet-content.worker';

// Other workers — available for future process registrations via app.get()
import { HealthSummaryWorker } from './workers/health-summary.worker';
import { MealPlanGenerationWorker } from './workers/meal-plan-generation.worker';
import { HealthReportExtractionWorker } from './workers/health-report-extraction.worker';
import { SaveHealthEventWorker } from './workers/save-health-event.worker';
import { SaveMedicationsDietWorker } from './workers/save-medications-diet.worker';
import { SaveHealthLifestyleWorker } from './workers/save-health-lifestyle.worker';
import { SaveTestResultsWorker } from './workers/save-test-results.worker';
import { AnalyzeLifestyleWorker } from './workers/analyze-lifestyle.worker';
import { SaveLifestyleWorker } from './workers/save-lifestyle.worker';
import { SaveForReviewWorker } from './workers/save-for-review.worker';
import { StartAiSuggestionsWorker } from './workers/start-ai-suggestions.worker';

@Module({
  imports: [
    AppLoggerModule,
    ConfigModule.forRoot({ isGlobal: true }),
    HttpModule,
  ],
  providers: [
    Logger,
    CamundaClientProvider,

    // Shared services
    LlmService,
    StreamerClientService,
    ApiClientService,

    // chat-input-processor BPMN workers
    GetUserDetailsWorker,
    ClassifyContentWorker,
    AnalyzeDietContentWorker,
    SaveDietContentWorker,

    // Remaining workers (available via app.get() for future process registrations)
    HealthSummaryWorker,
    MealPlanGenerationWorker,
    HealthReportExtractionWorker,
    SaveHealthEventWorker,
    SaveMedicationsDietWorker,
    SaveHealthLifestyleWorker,
    SaveTestResultsWorker,
    AnalyzeLifestyleWorker,
    SaveLifestyleWorker,
    SaveForReviewWorker,
    StartAiSuggestionsWorker,
  ],
})
export class AppModule {}
