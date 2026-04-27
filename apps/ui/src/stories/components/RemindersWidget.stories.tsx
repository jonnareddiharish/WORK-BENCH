import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { RemindersWidget } from '../../app/components/reminders/RemindersWidget';
import type { Reminder } from '../../app/types';

const today = new Date();
const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
const overdue  = new Date(today); overdue.setDate(today.getDate() - 3);
const future   = new Date(today); future.setDate(today.getDate() + 14);

const sampleReminders: Reminder[] = [
  {
    _id:           'r1',
    reminderType:  'APPOINTMENT',
    title:         'Follow-up with Dr. Sharma – Cardiology',
    dueDate:       tomorrow.toISOString(),
    isDone:        false,
    reportLabel:   'Visit Group · Apr 2026',
  },
  {
    _id:           'r2',
    reminderType:  'FOLLOW_UP_TEST',
    title:         'HbA1c Blood Test',
    dueDate:       overdue.toISOString(),
    isDone:        false,
  },
  {
    _id:           'r3',
    reminderType:  'MEDICATION_END',
    title:         'Metformin course ends',
    dueDate:       future.toISOString(),
    isDone:        false,
    reportLabel:   'Prescription · Feb 2026',
  },
];

const meta: Meta<typeof RemindersWidget> = {
  title:      'Components / RemindersWidget',
  component:  RemindersWidget,
  tags:       ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story: React.ComponentType) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof RemindersWidget>;

export const WithReminders: Story = {
  args: {
    reminders: sampleReminders,
    userId:    'user1',
    onDismiss: (id: string) => alert(`Dismissed ${id}`),
  },
};

export const SingleOverdue: Story = {
  args: {
    reminders: [sampleReminders[1]],
    userId:    'user1',
    onDismiss: () => {},
  },
};

export const Empty: Story = {
  args: {
    reminders: [],
    userId:    'user1',
    onDismiss: () => {},
  },
};
