import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type MealPlanDocument = MealPlan & Document;

@Schema({ timestamps: true })
export class MealPlan {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop([Object])
  days: {
    dayNumber: number;
    date: string;
    meals: {
      mealType: string; // BREAKFAST, LUNCH, DINNER, SNACK
      title: string;
      reasoning: string;
      benefits: string;
      recipeId?: string;
      ingredients: {
        name: string;
        teluguName?: string;
        tamilName?: string;
        quantity: string;
      }[];
    }[];
  }[];

  @Prop([String])
  warnings: string[];

  @Prop({ default: true })
  isActive: boolean;
}

export const MealPlanSchema = SchemaFactory.createForClass(MealPlan);
