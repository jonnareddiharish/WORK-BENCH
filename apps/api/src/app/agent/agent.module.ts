import { Module, forwardRef } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { UsersModule } from '../users/users.module';
import { ReminderModule } from '../reminders/reminder.module';

import { MongooseModule } from '@nestjs/mongoose';
import { HealthEvent, HealthEventSchema } from '../health-events/health-event.schema';
import { DietLog, DietLogSchema } from '../diet-logs/diet-log.schema';
import { Lifestyle, LifestyleSchema } from '../lifestyle/lifestyle.schema';
import { Reminder, ReminderSchema } from '../reminders/reminder.schema';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    ReminderModule,
    MongooseModule.forFeature([
      { name: HealthEvent.name, schema: HealthEventSchema },
      { name: DietLog.name, schema: DietLogSchema },
      { name: Lifestyle.name, schema: LifestyleSchema },
      { name: Reminder.name, schema: ReminderSchema },
    ]),
  ],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
