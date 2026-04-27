import type { Meta, StoryObj } from '@storybook/react';
import { Badge, StatusBadge } from '../../app/components/ui/Badge';

const meta: Meta<typeof Badge> = {
  title:     'UI / Badge',
  component: Badge,
  tags:      ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'primary', 'success', 'warning', 'danger', 'indigo', 'teal', 'emerald', 'rose', 'amber', 'violet'],
    },
    size: { control: 'select', options: ['sm', 'md'] },
  },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: { children: 'Default', variant: 'default' },
};

export const Primary: Story = {
  args: { children: 'Primary', variant: 'primary' },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(['default', 'primary', 'success', 'warning', 'danger', 'indigo', 'teal', 'emerald', 'rose', 'amber', 'violet'] as const).map(v => (
        <Badge key={v} variant={v}>{v}</Badge>
      ))}
    </div>
  ),
};

export const StatusBadges: Story = {
  render: () => (
    <div className="flex gap-2">
      <StatusBadge status="ACTIVE" />
      <StatusBadge status="RESOLVED" />
      <StatusBadge status="ONGOING" />
    </div>
  ),
};
