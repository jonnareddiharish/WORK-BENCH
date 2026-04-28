import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoClient, Db } from 'mongodb';

export const CHAT_MONGO_CLIENT = 'CHAT_MONGO_CLIENT';
export const CHAT_MONGO_DB     = 'CHAT_MONGO_DB';

export const ChatMongoClientProvider: Provider = {
  provide: CHAT_MONGO_CLIENT,
  useFactory: async (cfg: ConfigService): Promise<MongoClient> => {
    const uri = cfg.get<string>('MONGODB_URI', 'mongodb://localhost:27017/workbench');
    const client = new MongoClient(uri);
    await client.connect();
    return client;
  },
  inject: [ConfigService],
};

export const ChatMongoDbProvider: Provider = {
  provide: CHAT_MONGO_DB,
  useFactory: (client: MongoClient): Db => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/workbench';
    const dbName = new URL(uri).pathname.slice(1) || 'workbench';
    return client.db(dbName);
  },
  inject: [CHAT_MONGO_CLIENT],
};
