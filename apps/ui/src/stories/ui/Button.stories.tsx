import type { Meta, StoryObj } from '@storybook/react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '../../app/components/ui/Button';

const meta: Meta<typeof Button> = {
  title:     'UI / Button',
  component: Button,
  tags:      ['autodocs'],
  argTypes: {
    variant:  { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger', 'success'] },
    size:     { control: 'select', options: ['xs', 'sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
    loading:  { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { children: 'Primary Button', variant: 'primary', size: 'md' },
};

export const Secondary: Story = {
  args: { children: 'Secondary Button', variant: 'secondary', size: 'md' },
};

export const Ghost: Story = {
  args: { children: 'Ghost Button', variant: 'ghost', size: 'md' },
};

export const Danger: Story = {
  args: { children: 'Delete', variant: 'danger', size: 'md' },
};

export const Success: Story = {
  args: { children: 'Save', variant: 'success', size: 'md' },
};

export const WithIcon: Story = {
  args: { children: 'Add Record', variant: 'primary', size: 'md', icon: <Plus className="w-4 h-4" /> },
};

export const Loading: Story = {
  args: { children: 'Saving…', variant: 'primary', size: 'md', loading: true },
};

export const Disabled: Story = {
  args: { children: 'Disabled', variant: 'primary', size: 'md', disabled: true },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Button size="xs" variant="primary">Extra Small</Button>
      <Button size="sm" variant="primary">Small</Button>
      <Button size="md" variant="primary">Medium</Button>
      <Button size="lg" variant="primary">Large</Button>
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex items-center gap-3 flex-wrap">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger" icon={<Trash2 className="w-4 h-4" />}>Delete</Button>
      <Button variant="success" icon={<RefreshCw className="w-4 h-4" />}>Saved</Button>
    </div>
  ),
};
