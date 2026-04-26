import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type DietLogDocument = DietLog & Document;

@Schema({ timestamps: true })
export class DietLog {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  date: Date; // Midnight of the day

  @Prop({ type: [String], required: true })
  mealTypes: string[]; // BREAKFAST, LUNCH, DINNER, SNACK, CRAVINGS, PILLS

  @Prop([Object])
  foodItems: {
    name: string;
    quantity: string;
  }[];

  @Prop()
  description: string;

  @Prop()
  waterIntakeLiters?: number;

  @Prop({ default: 'USER' })
  source: string; // USER, DOCTOR, AI

  @Prop({ index: true })
  reportGroupId?: string;

  @Prop()
  reportLabel?: string; // e.g. "Dr. John · Apr 26 2026"
}

export const DietLogSchema = SchemaFactory.createForClass(DietLog);
