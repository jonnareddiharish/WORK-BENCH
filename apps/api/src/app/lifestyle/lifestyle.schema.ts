import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type LifestyleDocument = Lifestyle & Document;

@Schema({ timestamps: true })
export class Lifestyle {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  date: Date; // Start date

  @Prop()
  endDate?: Date;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [String], default: ['GENERAL'] })
  categories: string[]; // SLEEP, EXERCISE, STRESS, etc.

  @Prop({ default: 'USER' })
  source: string; // USER, DOCTOR, AI

  @Prop({ index: true })
  reportGroupId?: string;

  @Prop()
  reportLabel?: string; // e.g. "Dr. John · Apr 26 2026"
}

export const LifestyleSchema = SchemaFactory.createForClass(Lifestyle);
