import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { FamilyMemberCard } from '../../app/components/family/FamilyMemberCard';
import type { User } from '../../app/types';

const sampleUser: User = {
  _id:               '1',
  name:              'Sarah Johnson',
  dob:               '1985-03-15',
  biologicalSex:     'Female',
  createdAt:         '2024-01-01',
  medicalConditions: ['Hypertension', 'Type 2 Diabetes'],
  allergies:         ['Penicillin'],
  medications:       ['Metformin', 'Lisinopril'],
};

const healthyUser: User = {
  _id:       '2',
  name:      'Tom Wilson',
  dob:       '1990-07-22',
  createdAt: '2024-01-01',
};

const meta: Meta<typeof FamilyMemberCard> = {
  title:      'Components / FamilyMemberCard',
  component:  FamilyMemberCard,
  tags:       ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story: React.ComponentType) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof FamilyMemberCard>;

export const WithConditions: Story = {
  args: {
    user:     sampleUser,
    onClick:  () => alert('clicked'),
    onDelete: () => alert('delete'),
  },
};

export const NoConditions: Story = {
  args: {
    user:     healthyUser,
    onClick:  () => alert('clicked'),
    onDelete: () => alert('delete'),
  },
};

export const ManyConditions: Story = {
  args: {
    user: {
      ...sampleUser,
      medicalConditions: ['Hypertension', 'Type 2 Diabetes', 'Arthritis', 'Asthma', 'GERD'],
    },
    onClick:  () => {},
    onDelete: () => {},
  },
};
