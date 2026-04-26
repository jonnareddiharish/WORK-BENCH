import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Reminder, ReminderDocument } from './reminder.schema';

@Injectable()
export class ReminderService {
  constructor(@InjectModel(Reminder.name) private reminderModel: Model<ReminderDocument>) {}

  async createMany(reminders: Partial<Reminder>[]): Promise<void> {
    await this.reminderModel.insertMany(reminders as any[]);
  }

  async findByUser(userId: string): Promise<Reminder[]> {
    return this.reminderModel
      .find({ userId: userId as any, isDone: false })
      .sort({ dueDate: 1 })
      .exec();
  }

  async markDone(reminderId: string): Promise<Reminder | null> {
    return this.reminderModel.findByIdAndUpdate(reminderId, { isDone: true }, { new: true }).exec();
  }

  async deleteByReportGroup(reportGroupId: string): Promise<void> {
    await this.reminderModel.deleteMany({ reportGroupId }).exec();
  }
}
