import type { Preview } from '@storybook/react';
import '../src/styles.css';

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date:  /Date$/i,
      },
    },
    layout: 'centered',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light',     value: '#f8fafc' },
        { name: 'white',     value: '#ffffff' },
        { name: 'dark',      value: '#0f172a' },
      ],
    },
  },
};

export default preview;
