import { Injectable, Inject } from '@nestjs/common';
import { Db, ObjectId } from 'mongodb';
import { MONGO_DB } from './mongo-client.provider';

@Injectable()
export class MongoChatService {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  async createSession(userId: string, inputType: string): Promise<string> {
    const doc = {
      userId,
      inputType,
      status: 'PENDING',
      processDefinitionKey: 'health-ai-workflow',
      processInstanceId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await this.db.collection('chatsessions').insertOne(doc);
    return result.insertedId.toString();
  }

  async updateSessionProcess(sessionId: string, processInstanceId: string): Promise<void> {
    await this.db.collection('chatsessions').updateOne(
      { _id: new ObjectId(sessionId) },
      { $set: { processInstanceId, updatedAt: new Date() } },
    );
  }

  async setSessionStatus(sessionId: string, status: 'ACTIVE' | 'COMPLETED' | 'FAILED'): Promise<void> {
    await this.db.collection('chatsessions').updateOne(
      { _id: new ObjectId(sessionId) },
      { $set: { status, updatedAt: new Date() } },
    );
  }

  async saveMessage(
    sessionId: string,
    userId: string,
    role: string,
    content: string,
    sequence: number,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const doc: Record<string, unknown> = {
      sessionId: new ObjectId(sessionId),
      userId,
      role,
      content,
      sequence,
      createdAt: new Date(),
    };
    if (metadata) doc['metadata'] = metadata;
    await this.db.collection('chatmessages').insertOne(doc);
  }

  async getNextSequence(sessionId: string): Promise<number> {
    const count = await this.db
      .collection('chatmessages')
      .countDocuments({ sessionId: new ObjectId(sessionId) });
    return count + 1;
  }
}
