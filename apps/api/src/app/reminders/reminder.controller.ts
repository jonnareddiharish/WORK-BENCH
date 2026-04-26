import { Controller, Get, Patch, Param } from '@nestjs/common';
import { ReminderService } from './reminder.service';

@Controller('api/users/:userId/reminders')
export class ReminderController {
  constructor(private reminderService: ReminderService) {}

  @Get()
  async getReminders(@Param('userId') userId: string) {
    return this.reminderService.findByUser(userId);
  }

  @Patch(':reminderId/done')
  async markDone(@Param('reminderId') reminderId: string) {
    return this.reminderService.markDone(reminderId);
  }
}
