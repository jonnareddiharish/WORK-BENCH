import type { Meta, StoryObj } from '@storybook/react';
import { Spinner, SkeletonCard } from '../../app/components/ui/Spinner';

const meta: Meta<typeof Spinner> = {
  title:     'UI / Spinner',
  component: Spinner,
  tags:      ['autodocs'],
  argTypes: {
    size: { control: 'select', options: ['xs', 'sm', 'md', 'lg'] },
  },
};

export default meta;
type Story = StoryObj<typeof Spinner>;

export const Default: Story = {
  args: { size: 'md' },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <Spinner size="xs" />
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
    </div>
  ),
};

export const SkeletonCards: Story = {
  render: () => (
    <div className="w-80 space-y-4">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  ),
};
