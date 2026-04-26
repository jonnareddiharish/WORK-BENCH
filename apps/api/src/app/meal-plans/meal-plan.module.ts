import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MealPlan, MealPlanSchema } from './meal-plan.schema';
import { MealPlanService } from './meal-plan.service';
import { MealPlanController } from './meal-plan.controller';
import { User, UserSchema } from '../users/user.schema';
import { HealthEvent, HealthEventSchema } from '../health-events/health-event.schema';
import { DietLog, DietLogSchema } from '../diet-logs/diet-log.schema';
import { Lifestyle, LifestyleSchema } from '../lifestyle/lifestyle.schema';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MealPlan.name, schema: MealPlanSchema },
      { name: User.name, schema: UserSchema },
      { name: HealthEvent.name, schema: HealthEventSchema },
      { name: DietLog.name, schema: DietLogSchema },
      { name: Lifestyle.name, schema: LifestyleSchema },
    ]),
    forwardRef(() => AgentModule),
  ],
  controllers: [MealPlanController],
  providers: [MealPlanService],
  exports: [MealPlanService],
})
export class MealPlanModule {}
