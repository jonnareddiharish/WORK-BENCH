import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ReminderDocument = Reminder & Document;

@Schema({ timestamps: true })
export class Reminder {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  reminderType: string; // APPOINTMENT | FOLLOW_UP_TEST | MEDICATION_END

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ index: true })
  reportGroupId?: string;

  @Prop()
  reportLabel?: string;

  @Prop({ default: false })
  isDone: boolean;

  @Prop()
  note?: string;
}

export const ReminderSchema = SchemaFactory.createForClass(Reminder);
