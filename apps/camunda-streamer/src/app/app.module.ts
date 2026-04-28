import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppLoggerModule } from '@work-bench/commons';
import { MongoModule } from './mongo/mongo.module';
import { CamundaModule } from './camunda/camunda.module';
import { ChatModule } from './chat/chat.module';
import { InternalModule } from './internal/internal.module';

@Module({
  imports: [
    AppLoggerModule,
    ConfigModule.forRoot({ isGlobal: true }),
    MongoModule,
    CamundaModule,
    ChatModule,
    InternalModule,
  ],
})
export class AppModule {}
