import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type AIPatientContextDocument = AIPatientContext & Document;

@Schema({ timestamps: true })
export class AIPatientContext {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ default: Date.now })
  lastUpdated: Date;

  @Prop({ type: Object, default: {} })
  promptContext: {
    demographics?: string;
    currentActiveConditions?: string[];
    currentMedications?: string[];
    recentDietaryPatterns?: string[];
    recentDoctorVisits?: string[];
  };
}

export const AIPatientContextSchema = SchemaFactory.createForClass(AIPatientContext);
