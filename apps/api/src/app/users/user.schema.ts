import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Family' })
  familyId?: MongooseSchema.Types.ObjectId;

  @Prop()
  email?: string;

  @Prop()
  phone?: string;

  @Prop({ required: false })
  password?: string; // Hashed password

  @Prop({ required: true })
  name: string;

  @Prop({ required: false })
  dob?: Date;

  @Prop()
  biologicalSex?: string;

  @Prop({ type: Object })
  baseMetrics?: {
    heightCm?: number;
    weightKg?: number;
    bloodType?: string;
  };

  @Prop([String])
  knownAllergies?: string[];

  @Prop([String])
  medicalConditions?: string[];

  @Prop([String])
  medications?: string[];

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;

  @Prop({ type: Object, default: { cuisine: 'SOUTH_INDIAN', language: 'ENGLISH', goal: 'HEALTHY_LIVING', durationDays: 3 } })
  mealPreferences?: {
    cuisine?: string;
    language?: string;
    goal?: string;
    durationDays?: number;
  };
}

export const UserSchema = SchemaFactory.createForClass(User);