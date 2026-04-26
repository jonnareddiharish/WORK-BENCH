import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type HealthEventDocument = HealthEvent & Document;

@Schema({ timestamps: true })
export class HealthEvent {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  eventType: string; // DOCTOR_VISIT, DISEASE_DIAGNOSIS, TREATMENT_START, MEDICATION

  @Prop({ required: true })
  date: Date;

  @Prop({ type: [String], required: true })
  titles: string[];

  @Prop({ required: true })
  status: string; // ACTIVE, RESOLVED, ONGOING

  @Prop()
  description: string;

  @Prop({ type: Object })
  details: {
    doctorName?: string;
    medicationName?: string;
    dosage?: string;
    symptoms?: string[];
    doctorNotes?: string;
  };

  @Prop({ default: 'USER' })
  source: string; // USER, DOCTOR, AI

  @Prop({ index: true })
  reportGroupId?: string; // Links all events parsed from the same medical report
}

export const HealthEventSchema = SchemaFactory.createForClass(HealthEvent);
