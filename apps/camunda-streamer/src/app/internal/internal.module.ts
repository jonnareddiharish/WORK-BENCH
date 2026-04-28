import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { ChatModule } from '../chat/chat.module';
import { MongoModule } from '../mongo/mongo.module';

@Module({
  imports: [ChatModule, MongoModule],
  controllers: [InternalController],
})
export class InternalModule {}
