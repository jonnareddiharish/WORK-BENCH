import { Module } from '@nestjs/common';
import { MongoClientProvider, MongoDbProvider } from './mongo-client.provider';
import { MongoChatService } from './mongo-chat.service';

@Module({
  providers: [MongoClientProvider, MongoDbProvider, MongoChatService],
  exports: [MongoChatService],
})
export class MongoModule {}
