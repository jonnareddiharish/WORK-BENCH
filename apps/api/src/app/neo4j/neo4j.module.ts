import { DynamicModule, Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Neo4jService } from './neo4j.service';

@Global()
@Module({})
export class Neo4jModule {
  static forRootAsync(): DynamicModule {
    return {
      module: Neo4jModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: 'NEO4J_CONFIG',
          useFactory: async (configService: ConfigService) => ({
            uri: configService.get<string>('NEO4J_URI'),
            username: configService.get<string>('NEO4J_USERNAME'),
            password: configService.get<string>('NEO4J_PASSWORD'),
          }),
          inject: [ConfigService],
        },
        Neo4jService,
      ],
      exports: [Neo4jService],
    };
  }
}
