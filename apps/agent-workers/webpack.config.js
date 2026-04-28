const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/agent-workers'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  // Prevent webpack from trying to bundle pino's worker-thread transport.
  // pino-pretty spawns a worker thread at runtime; webpack's static analysis
  // gets stuck tracing it. These packages are always present in node_modules.
  externals: [
    /^pino/,
    'thread-stream',
    'sonic-boom',
    'real-require',
    'on-exit-leak-free',
  ],
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: [],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      sourceMap: true,
    }),
  ],
};
