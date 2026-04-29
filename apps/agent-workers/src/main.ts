import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { CAMUNDA_CLIENT, startMultipleWorkers } from '@work-bench/camunda-worker';
import { AppModule } from './app/app.module';

// chat-input-processor BPMN workers
import { GetUserDetailsWorker } from './app/workers/get-user-details.worker';
import { ClassifyContentWorker } from './app/workers/chat-input-classification/classify-content.worker';
import { AnalyzeDietContentWorker } from './app/workers/diet-logs/analyze-diet-content.worker';
import { SaveDietContentWorker } from './app/workers/save-diet-content.worker';
import { StartAiSuggestionsWorker } from './app/workers/start-ai-suggestions.worker';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const camundaClient = app.get(CAMUNDA_CLIENT);

  startMultipleWorkers(camundaClient, [
    app.get(GetUserDetailsWorker),
    app.get(ClassifyContentWorker),
    app.get(AnalyzeDietContentWorker),
    app.get(SaveDietContentWorker),
    app.get(StartAiSuggestionsWorker),
  ]);

  app.get(Logger).log('chat-input-processor workers registered and polling Camunda');
}

bootstrap();
