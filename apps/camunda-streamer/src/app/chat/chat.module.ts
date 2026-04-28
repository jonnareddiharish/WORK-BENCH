import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { MongoModule } from '../mongo/mongo.module';
import { CamundaModule } from '../camunda/camunda.module';

@Module({
  imports: [MongoModule, CamundaModule],
  providers: [ChatService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
