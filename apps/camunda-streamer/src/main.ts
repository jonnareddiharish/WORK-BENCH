import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableCors({ origin: ['http://localhost:4200'] });
  const port = process.env['PORT'] ?? 3001;
  await app.listen(port);
  app.get(Logger).log(`camunda-streamer listening on port ${port}`);
}

bootstrap();
