import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User, UserSchema } from './user.schema';
import { Family, FamilySchema } from '../families/family.schema';
import { HealthEvent, HealthEventSchema } from '../health-events/health-event.schema';
import { DietLog, DietLogSchema } from '../diet-logs/diet-log.schema';
import { Lifestyle, LifestyleSchema } from '../lifestyle/lifestyle.schema';
import { AIPatientContext, AIPatientContextSchema } from '../ai-context/ai-context.schema';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Family.name, schema: FamilySchema },
      { name: HealthEvent.name, schema: HealthEventSchema },
      { name: DietLog.name, schema: DietLogSchema },
      { name: Lifestyle.name, schema: LifestyleSchema },
      { name: AIPatientContext.name, schema: AIPatientContextSchema },
    ]),
    forwardRef(() => AgentModule),
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UsersModule {}