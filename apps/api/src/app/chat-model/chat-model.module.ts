import { Module } from '@nestjs/common';
import { ChatMongoClientProvider, ChatMongoDbProvider } from './mongo-client.provider';
import { ChatModelService } from './chat-model.service';
import { ChatModelController } from './chat-model.controller';

@Module({
  providers: [ChatMongoClientProvider, ChatMongoDbProvider, ChatModelService],
  controllers: [ChatModelController],
})
export class ChatModelModule {}
