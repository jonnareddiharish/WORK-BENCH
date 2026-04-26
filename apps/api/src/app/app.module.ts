import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { Neo4jModule } from './neo4j/neo4j.module';
import { AgentModule } from './agent/agent.module';
import { MealPlanModule } from './meal-plans/meal-plan.module';
import { RecipeModule } from './recipes/recipe.module';
import { ReminderModule } from './reminders/reminder.module';

@Module({
  imports: [
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
