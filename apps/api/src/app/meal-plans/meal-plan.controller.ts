import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common';
import { MealPlanService } from './meal-plan.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/user.schema';
import { HealthEvent, HealthEventDocument } from '../health-events/health-event.schema';
import { DietLog, DietLogDocument } from '../diet-logs/diet-log.schema';
import { Lifestyle, LifestyleDocument } from '../lifestyle/lifestyle.schema';

@Controller('api/users/:userId/meal-plans')
export class MealPlanController {
  constructor(
    private readonly mealPlanService: MealPlanService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(HealthEvent.name) private healthEventModel: Model<HealthEventDocument>,
    @InjectModel(DietLog.name) private dietLogModel: Model<DietLogDocument>,
    @InjectModel(Lifestyle.name) private lifestyleModel: Model<LifestyleDocument>
  ) {}

  @Get('active')
  async getActiveMealPlan(@Param('userId') userId: string) {
    return this.mealPlanService.getActiveMealPlan(userId);
  }

  @Post('generate')
  async generateMealPlan(
    @Param('userId') userId: string,
    @Body() preferences: { cuisine?: string; language?: string; goal?: string; durationDays?: number }
  ) {
    const [user, healthEvents, dietLogs, lifestyle] = await Promise.all([
      this.userModel.findById(userId).lean(),
      this.healthEventModel.find({ userId } as any).sort({ date: -1 }).limit(10).lean(),
      this.dietLogModel.find({ userId } as any).sort({ date: -1 }).limit(10).lean(),
      this.lifestyleModel.find({ userId } as any).sort({ date: -1 }).limit(10).lean(),
    ]);

    if (!user) throw new Error('User not found');

    // Save preferences on user doc
    await this.userModel.findByIdAndUpdate(userId, { mealPreferences: preferences });

    return this.mealPlanService.generateMealPlan(userId, user, healthEvents, dietLogs, lifestyle, preferences);
  }

  @Patch('preferences')
  async updatePreferences(
    @Param('userId') userId: string,
    @Body() preferences: { cuisine?: string; language?: string; goal?: string; durationDays?: number }
  ) {
    return this.userModel.findByIdAndUpdate(userId, { mealPreferences: preferences }, { new: true });
  }
}
