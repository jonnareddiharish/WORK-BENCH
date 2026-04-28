import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { Neo4jModule } from './neo4j/neo4j.module';
import { AgentModule } from './agent/agent.module';
import { MealPlanModule } from './meal-plans/meal-plan.module';
import { RecipeModule } from './recipes/recipe.module';
import { ReminderModule } from './reminders/reminder.module';
import { ChatModelModule } from './chat-model/chat-model.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, singleLine: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
        level: 'debug',
        autoLogging: false,
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/api/.env',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI', 'mongodb://localhost:27017/workbench'),
      }),
      inject: [ConfigService],
    }),
    Neo4jModule.forRootAsync(),
    UsersModule,
    AgentModule,
    MealPlanModule,
    RecipeModule,
    ReminderModule,
    ChatModelModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
