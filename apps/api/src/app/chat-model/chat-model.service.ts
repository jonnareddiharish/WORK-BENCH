import { Injectable, Inject } from '@nestjs/common';
import { Db, ObjectId } from 'mongodb';
import { CHAT_MONGO_DB } from './mongo-client.provider';

@Injectable()
export class ChatModelService {
  constructor(@Inject(CHAT_MONGO_DB) private readonly db: Db) {}

  async getSessions(userId: string): Promise<unknown[]> {
    return this.db
      .collection('chatsessions')
      .find({ userId })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async getSession(sessionId: string): Promise<unknown | null> {
    return this.db
      .collection('chatsessions')
      .findOne({ _id: new ObjectId(sessionId) });
  }

  async getMessages(sessionId: string): Promise<unknown[]> {
    return this.db
      .collection('chatmessages')
      .find({ sessionId: new ObjectId(sessionId) })
      .sort({ sequence: 1 })
      .toArray();
  }
}
