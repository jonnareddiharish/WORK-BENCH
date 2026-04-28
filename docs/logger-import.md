# Shared Logger — `@work-bench/commons`

All apps in this monorepo use a single, pre-configured pino logger provided by the `AppLoggerModule` from `libs/commons`. This avoids copy-pasting the `LoggerModule.forRoot(...)` block in every app.

---

## Library location

```
libs/commons/
├── project.json
├── tsconfig.json
├── tsconfig.lib.json
└── src/
    ├── index.ts                      ← barrel export
    └── lib/logger/
        └── logger.module.ts          ← AppLoggerModule
```

Path alias (registered in `tsconfig.base.json`):

```
@work-bench/commons  →  libs/commons/src/index.ts
```

---

## What it configures

`AppLoggerModule` wraps `nestjs-pino`'s `LoggerModule.forRoot(...)` with:

| Setting | Value |
|---|---|
| Transport | `pino-pretty` — colorized, single-line output |
| Timestamp | `SYS:HH:MM:ss` |
| Suppressed fields | `pid`, `hostname` |
| Log level | `process.env.LOG_LEVEL` (default: `debug`) |
| HTTP auto-logging | disabled (`autoLogging: false`) |

The pino packages (`pino`, `pino-pretty`, `thread-stream`, etc.) are listed in each app's `webpack.config.js` `externals` array so webpack does not try to bundle them — they are resolved from `node_modules` at runtime.

---

## How to use in an app

### 1. Import `AppLoggerModule` in the root `AppModule`

```typescript
import { AppLoggerModule } from '@work-bench/commons';

@Module({
  imports: [
    AppLoggerModule,            // ← replaces the inline LoggerModule.forRoot(...)
    ConfigModule.forRoot({ isGlobal: true }),
    // ... other modules
  ],
})
export class AppModule {}
```

Remove any existing inline `LoggerModule.forRoot(...)` and its `nestjs-pino` import from the app module.

### 2. Switch the bootstrap logger in `main.ts`

```typescript
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  await app.listen(process.env['PORT'] ?? 3000);
}
bootstrap();
```

`bufferLogs: true` holds any logs that fire before pino is ready, then flushes them through pino once it is initialised.

### 3. Inject `Logger` in services and workers

```typescript
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MyService {
  constructor(private readonly logger: Logger) {}

  doSomething() {
    this.logger.log('Working…');
    this.logger.warn('Something suspicious');
    this.logger.error('Something broke');
  }
}
```

> **Note:** Import `Logger` from `@nestjs/common`, not from `nestjs-pino` directly. NestJS resolves it to the pino implementation automatically once `AppLoggerModule` is in scope.

---

## Current adoption

| App | Status |
|---|---|
| `apps/camunda-streamer` | Uses `AppLoggerModule` |
| `apps/agent-workers` | Inline `LoggerModule.forRoot(...)` — migrate when convenient |
| `apps/api` | Inline `LoggerModule.forRoot(...)` — migrate when convenient |

---

## Changing the log level at runtime

Set the `LOG_LEVEL` environment variable before starting any app:

```bash
LOG_LEVEL=info npm run start:streamer
LOG_LEVEL=warn npm run start:workers
```

Valid levels (pino): `trace`, `debug`, `info`, `warn`, `error`, `fatal`.

---

## Adding the commons lib to a new app's tsconfig

If a new app does not already extend `tsconfig.base.json`, add the path alias manually in its `tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@work-bench/commons": ["libs/commons/src/index.ts"]
    }
  }
}
```

This is already present via the base config for all existing apps.
