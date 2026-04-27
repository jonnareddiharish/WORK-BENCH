# @work-bench/camunda-worker

Shared library for building Camunda 7 external task workers in NestJS. Provides a class decorator, abstract base class, topic registry, Camunda client provider, and startup service that together eliminate all boilerplate from individual worker classes.

---

## Table of contents

- [Architecture overview](#architecture-overview)
- [The `@Worker` decorator](#the-worker-decorator)
  - [What it does](#what-it-does)
  - [How it works internally](#how-it-works-internally)
  - [All properties it sets](#all-properties-it-sets)
  - [Decorator ordering](#decorator-ordering)
- [CamundaWorker base class](#camundaworker-base-class)
  - [Retry logic in detail](#retry-logic-in-detail)
  - [Logger wiring](#logger-wiring)
- [CAMUNDA_TOPICS_CONFIG registry](#camunda_topics_config-registry)
  - [WorkerConfig shape](#workerconfig-shape)
  - [Helper functions](#helper-functions)
- [CamundaClientProvider](#camundaclientprovider)
  - [Environment variables](#environment-variables)
  - [Debug event handlers](#debug-event-handlers)
- [CamundaWorkersStartupService](#camundaworkerstartupservice)
  - [Lifecycle](#lifecycle)
  - [Standalone helpers](#standalone-helpers)
- [Adding a new worker — step by step](#adding-a-new-worker--step-by-step)
- [API reference](#api-reference)

---

## Architecture overview

```
CAMUNDA_TOPICS_CONFIG          @Worker decorator
(central topic registry)  ──►  (wires config onto class at construction time)
                                        │
                                        ▼
                          CamundaWorker (abstract base)
                          ┌─────────────────────────────┐
                          │  topic         ← decorator  │
                          │  options       ← decorator  │
                          │  maxRetryCount ← decorator  │
                          │  retryTimeoutMs← decorator  │
                          │  handler()  ← wraps run()   │
                          │  run()      ← you implement │
                          └─────────────────────────────┘
                                        │
                          CamundaWorkersStartupService
                          subscribes each worker to the
                          Camunda client on bootstrap,
                          unsubscribes on shutdown
                                        │
                          CamundaClientProvider
                          creates the camunda-external-task-client-js
                          Client from env vars via ConfigService
```

The flow for a single task execution:

```
Camunda Engine
     │  long-poll (fetch & lock)
     ▼
camunda-external-task-client-js Client
     │  calls handler({ task, taskService })
     ▼
CamundaWorker.handler()          ← logs start, catches errors, calls handleFailure
     │
     ▼
YourWorker.run()                 ← your business logic
     │
     ▼
taskService.complete(task, vars) ← signals success back to the engine
```

---

## The `@Worker` decorator

**File:** `src/lib/worker.decorator.ts`

```typescript
import { Worker } from '@work-bench/camunda-worker';

@Injectable()
@Worker('healthSummaryAnalysis')
export class HealthSummaryWorker extends CamundaWorker { ... }
```

The decorator takes a single string argument — the **worker key** — which must match a key in `CAMUNDA_TOPICS_CONFIG.workers`. It reads the full `WorkerConfig` at class-decoration time and stamps the config values onto every constructed instance before any other code runs.

### What it does

1. **Resolves config** — calls `getWorkerConfig(workerKey)` which looks up the key in `CAMUNDA_TOPICS_CONFIG.workers` and throws a descriptive error at startup if the key is missing. Misconfiguration is always caught at boot, never silently at runtime.

2. **Wraps the constructor** — replaces the class constructor with `WrappedConstructor`, which:
   - Calls the original constructor with all arguments intact (so NestJS DI still injects dependencies normally)
   - Then sets `topic`, `maxRetryCount`, `retryTimeoutMs`, and the full `options` object on the instance

3. **Preserves class identity** — copies `prototype` and all own enumerable static properties from the original constructor onto `WrappedConstructor`, including NestJS reflection metadata emitted by `@Injectable()` and `emitDecoratorMetadata`. This ensures the DI container can still resolve the class and inject its constructor parameters.

4. **Preserves class name** — sets `WrappedConstructor.name` to the original class name so stack traces, logger output, and NestJS error messages still refer to the right name.

### How it works internally

```typescript
function Worker(workerKey: string) {
  return (TargetClass) => {
    const config = getWorkerConfig(workerKey);          // ← throws at boot if key missing
    const originalConstructor = TargetClass;

    function WrappedConstructor(...args) {
      const instance = new originalConstructor(...args); // ← DI args passed through

      // Stamp config onto the instance
      instance.topic          = config.topic;
      instance.maxRetryCount  = config.options?.maxRetryCount  ?? 3;
      instance.retryTimeoutMs = config.options?.retryTimeoutMs ?? 10_000;
      instance.options        = { ...all SubscribeOptions fields... };

      return instance;
    }

    WrappedConstructor.prototype = originalConstructor.prototype;
    Object.defineProperty(WrappedConstructor, 'name', { value: TargetClass.name });
    // Copy static metadata for NestJS reflection
    copyStaticProperties(originalConstructor, WrappedConstructor);

    return WrappedConstructor;
  };
}
```

The key invariant: **the decorator runs once at module load**, but `WrappedConstructor` runs on every instantiation. Config is resolved once; it is applied to every instance.

### All properties it sets

| Property | Source | Default if absent |
|---|---|---|
| `topic` | `config.topic` | — (required, no default) |
| `maxRetryCount` | `config.options.maxRetryCount` | `3` |
| `retryTimeoutMs` | `config.options.retryTimeoutMs` | `10_000` ms |
| `options.lockDuration` | `config.options.lockDuration` | `undefined` (engine default) |
| `options.variables` | `config.options.variables` | `undefined` (all variables) |
| `options.processDefinitionId` | `config.options.processDefinitionId` | `undefined` |
| `options.processDefinitionIdIn` | `config.options.processDefinitionIdIn` | `undefined` |
| `options.processDefinitionKey` | `config.options.processDefinitionKey` | `undefined` |
| `options.processDefinitionKeyIn` | `config.options.processDefinitionKeyIn` | `undefined` |
| `options.processDefinitionVersionTag` | `config.options.processDefinitionVersionTag` | `undefined` |
| `options.withoutTenantId` | `config.options.withoutTenantId` | `undefined` |
| `options.tenantIdIn` | `config.options.tenantIdIn` | `undefined` |
| `options.businessKey` | `config.options.businessKey` | `undefined` |
| `options.processInstanceId` | `config.options.processInstanceId` | `undefined` |
| `options.processVariables` | `config.options.processVariables` | `undefined` |
| `options.deserializeValues` | `config.options.deserializeValues` | `undefined` |
| `options.localVariables` | `config.options.localVariables` | `undefined` |
| `options.includeExtensionProperties` | `config.options.includeExtensionProperties` | `undefined` |

### Decorator ordering

TypeScript applies class decorators **bottom-up**. `@Worker` must be placed **below** `@Injectable()` so that `@Injectable()` runs first and emits its reflection metadata onto the original class before `@Worker` wraps the constructor. `@Worker` then copies that metadata across to the wrapper.

```typescript
@Injectable()   // ← applied second (outer)
@Worker('key')  // ← applied first (inner, wraps constructor)
export class MyWorker extends CamundaWorker { ... }
```

---

## CamundaWorker base class

**File:** `src/lib/camunda-worker.ts`

All worker classes extend `CamundaWorker`. The only method you must implement is `run()`.

```typescript
export default abstract class CamundaWorker {
  topic!: string;                    // set by @Worker
  options: SubscribeOptions = {};    // set by @Worker
  maxRetryCount = 3;                 // set by @Worker (fallback: 3)
  retryTimeoutMs = 10_000;           // set by @Worker (fallback: 10 s)
  protected logger!: Logger;         // set by subclass constructor

  abstract run({ task, taskService }: HandlerArgs): Promise<void>;
  async handler({ task, taskService }: HandlerArgs): Promise<void> { ... }
}
```

#### `run({ task, taskService })`

Implement your task business logic here. When you call `taskService.complete(task, variables)`, the engine marks the task done and the process advances. If `run()` throws, `handler()` catches it and calls `taskService.handleFailure()` automatically — you do not need to catch errors yourself.

#### `handler({ task, taskService })`

Called directly by the Camunda client for every fetched task. You never call this yourself. It:

1. Logs `Starting task [id] with topic [...] for process [...]`
2. Calls `await this.run(...)` 
3. On success: logs `Finished task [...]`
4. On error: runs the retry resolution logic (see below), calls `taskService.handleFailure()`, then re-throws

### Retry logic in detail

When `run()` throws, `handler()` resolves `retriesRemaining` through a three-tier priority chain:

```
Priority 1 (highest): task.retries field
  The engine sets this after the first failure. It reflects how many
  retries have already been used. retriesRemaining = task.retries - 1.

Priority 2: retryCount process variable
  If the process model sets a Camunda variable named "retryCount" (number),
  that value is used as retriesRemaining directly. Allows per-instance
  retry overrides without code changes.

Priority 3 (fallback): CAMUNDA_TOPICS_CONFIG
  Looks up the worker's topic in the config registry and reads
  options.maxRetryCount. Falls back to the instance's maxRetryCount
  field (default 3) if the config lookup fails.
```

Similarly, `retryTimeout` is resolved:

```
Priority 1: retryTimeout process variable (number, milliseconds)
Priority 2: config options.retryTimeoutMs (fallback to retryTimeoutMs field)
```

**Log levels based on outcome:**

| Condition | Log level | Message |
|---|---|---|
| `retriesRemaining > 0` | `warn` | `(Will be retried) Error during task [...]` |
| `retriesRemaining === 0` | `error` | `Raising incident for error during task [...]` with `camundaIncident: true` and `camundaProcessId` |

The `camundaIncident: true` flag in the error metadata is a structured marker that logging aggregators (e.g. Datadog, Grafana Loki) can alert on.

### Logger wiring

The base class declares `protected logger!: Logger` with a definite-assignment assertion (`!`). The subclass constructor sets it via a TypeScript parameter property:

```typescript
constructor(
  protected readonly logger: Logger,  // ← sets this.logger on both subclass and base
  private readonly otherService: SomeService,
) {
  super();
}
```

Because `logger` is declared `protected` in the subclass constructor, it is accessible to all methods in `CamundaWorker` via `this.logger`. NestJS injects a `Logger` instance when you list `Logger` as a provider in your module.

---

## CAMUNDA_TOPICS_CONFIG registry

**File:** `src/lib/camunda-topics.config.ts`

The central, compile-time registry that maps worker keys to topic names and subscribe options. Every worker in the monorepo has exactly one entry here. The `@Worker` decorator reads from this object at class-decoration time.

```typescript
export const CAMUNDA_TOPICS_CONFIG: CamundaTopicsConfig = {
  workers: {
    healthSummaryAnalysis: {
      topic: 'topic.agent.health-summary-analysis',
      description: 'Generates an AI health summary for a user',
      enabled: true,
      options: {
        lockDuration: 30_000,   // 30 s lock on the fetched task
        maxRetryCount: 3,
        retryTimeoutMs: 10_000,
      },
    },
  },
} as const;
```

### WorkerConfig shape

```typescript
interface WorkerConfig {
  topic: string;          // Camunda topic name (must be unique across all workers)
  description: string;    // Human-readable description (also validated at startup)
  enabled?: boolean;      // Default true; set false to skip in getEnabledWorkers()
  options?: {
    // --- Subscribe / fetch options (forwarded to camunda-external-task-client-js) ---
    lockDuration?: number;               // ms to lock fetched tasks (overrides client default)
    variables?: string[];                // only fetch these variable names (undefined = all)
    processDefinitionId?: string;        // filter by process definition ID
    processDefinitionIdIn?: string[];    // filter by list of process definition IDs
    processDefinitionKey?: string;       // filter by process definition key
    processDefinitionKeyIn?: string[];   // filter by list of process definition keys
    processDefinitionVersionTag?: string;
    withoutTenantId?: boolean;           // only fetch tasks with no tenant ID
    tenantIdIn?: string[];               // filter by tenant IDs
    businessKey?: string;                // filter by business key
    processInstanceId?: string;
    processVariables?: Record<string, unknown>;  // filter by process variable values
    deserializeValues?: boolean;
    localVariables?: boolean;
    includeExtensionProperties?: boolean;

    // --- Retry behaviour (consumed by CamundaWorker.handler) ---
    maxRetryCount?: number;   // how many times to retry on error (default 3)
    retryTimeoutMs?: number;  // delay before the engine re-queues the task (default 10 000 ms)
  };
}
```

### Helper functions

All exported from the lib barrel (`@work-bench/camunda-worker`).

#### `getWorkerConfig(workerKey: string): WorkerConfig`

Returns the config for a key. Throws a descriptive error listing all available keys if the key is not found. Used internally by `@Worker`; also useful in tests.

```typescript
const config = getWorkerConfig('healthSummaryAnalysis');
// → { topic: 'topic.agent.health-summary-analysis', ... }
```

#### `getTopicName(workerKey: string): string`

Shorthand for `getWorkerConfig(key).topic`. Useful when you need the raw topic string in tests or non-worker code (e.g. to publish a message targeting a specific service task).

```typescript
const topic = getTopicName('healthSummaryAnalysis');
// → 'topic.agent.health-summary-analysis'
```

#### `getEnabledWorkers(): Array<{ key: string; config: WorkerConfig }>`

Returns all entries where `enabled !== false`. Useful for introspection, dashboards, or integration tests that want to assert every enabled worker is registered.

```typescript
const enabled = getEnabledWorkers();
// → [{ key: 'healthSummaryAnalysis', config: {...} }, ...]
```

#### `validateWorkerConfigurations(): string[]`

Returns an array of validation error messages (empty array = all valid). Checks for:
- Duplicate topic strings across workers
- Missing `topic` field
- Missing `description` field

Call this in a bootstrap hook or health-check endpoint to catch config mistakes early:

```typescript
const errors = validateWorkerConfigurations();
if (errors.length > 0) {
  throw new Error(`Camunda config errors:\n${errors.join('\n')}`);
}
```

---

## CamundaClientProvider

**File:** `src/lib/camunda-client.provider.ts`

A NestJS `Provider` that constructs and configures the `camunda-external-task-client-js` `Client` from environment variables. Inject it by adding `CamundaClientProvider` to your module's `providers` array.

```typescript
import { CamundaClientProvider } from '@work-bench/camunda-worker';

@Module({
  providers: [CamundaClientProvider, ...],
})
export class AppModule {}
```

Inject the client elsewhere using the `CAMUNDA_CLIENT` token:

```typescript
import { CAMUNDA_CLIENT } from '@work-bench/camunda-worker';

@Injectable()
export class SomeService {
  constructor(@Inject(CAMUNDA_CLIENT) private readonly client: unknown) {}
}
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `CAMUNDA_URI` | — | Base URL of the Camunda REST API, e.g. `http://localhost:8080/engine-rest` |
| `CAMUNDA_USERNAME` | — | Basic auth username. Omit to connect without auth. |
| `CAMUNDA_PASSWORD` | — | Basic auth password. |
| `CAMUNDA_APP_WORKER_ID` | `app-<random>` | Unique identifier for this worker process instance. The engine uses this to assign tasks. |
| `CAMUNDA_MAX_TASKS` | `10` | Max tasks to fetch per poll cycle. |
| `CAMUNDA_LOCK_DURATION` | `5000` | Default lock duration (ms) for fetched tasks. Overridden per-topic by `WorkerConfig.options.lockDuration`. |
| `CAMUNDA_RETRY_TIMEOUT` | `2000` | Default retry timeout (ms) on network errors. |
| `CAMUNDA_ASYNC_RESPONSE_TIMEOUT` | `5000` | Long-poll timeout (ms). The engine holds the connection open for up to this duration waiting for a task. |
| `CAMUNDA_MAX_PARALLEL_EXECUTIONS` | `10` | Max concurrent task executions. |
| `CAMUNDA_INTERVAL` | `500` | Polling interval (ms) between poll cycles when async response is disabled. |

### Debug event handlers

The provider attaches listeners to every client event and logs them at the `debug` level. Enable NestJS debug logging to see them:

| Event | Log message |
|---|---|
| `subscribe` | `Subscribed to Camunda topic: <topic>` |
| `unsubscribe` | `Unsubscribed from Camunda topic: <topic>` |
| `poll:start` | `Camunda polling started` |
| `poll:stop` | `Camunda polling stopped` |
| `poll:success` | `Received N tasks from Camunda` (only when N > 0) |
| `poll:error` | `Camunda polling error` + full error; additionally logs `Authentication failed!` when the message contains `401` |

---

## CamundaWorkersStartupService

**File:** `src/lib/camunda-workers-startup.service.ts`

An `@Injectable()` NestJS service that wires all workers to the client and manages the polling lifecycle. It is the glue between the DI container and the Camunda client.

```typescript
import {
  CAMUNDA_WORKERS_TOKEN,
  CamundaWorkersStartupService,
} from '@work-bench/camunda-worker';

@Module({
  providers: [
    CamundaClientProvider,
    WorkerA, WorkerB,
    {
      provide: CAMUNDA_WORKERS_TOKEN,
      useFactory: (a: WorkerA, b: WorkerB) => [a, b],
      inject: [WorkerA, WorkerB],
    },
    CamundaWorkersStartupService,
  ],
})
export class AppModule {}
```

### Lifecycle

| Phase | What happens |
|---|---|
| **Construction** | Iterates `workers` and calls `client.subscribe(worker.topic, worker.options, worker.handler.bind(worker))` for each. All topics are registered before the application is fully initialized. |
| **`onApplicationBootstrap()`** | Calls `client.start()` — begins long-polling the engine. Runs after all providers are resolved. |
| **`onApplicationShutdown()`** | Calls `client.unsubscribe(worker.topic)` for each worker, then `client.stop()` — stops polling and releases any held tasks cleanly. |

The `worker.handler.bind(worker)` call is intentional: the Camunda client calls the handler as a plain function, so `this` must be explicitly bound to the worker instance. Without `.bind(worker)`, `this.logger`, `this.topic`, etc. would all be `undefined` inside `handler()`.

### Standalone helpers

For cases where you want to manage worker startup outside of the service (e.g. scripts, tests):

#### `startSingleWorker(client, worker): void`

Subscribes one worker and immediately calls `client.start()`.

```typescript
import { startSingleWorker } from '@work-bench/camunda-worker';

const worker = new MyWorker(logger, configService);
startSingleWorker(client, worker);
```

#### `startMultipleWorkers(client, workers): void`

Subscribes multiple workers, guards against duplicate topic registrations (throws), then calls `client.start()`.

```typescript
import { startMultipleWorkers } from '@work-bench/camunda-worker';

startMultipleWorkers(client, [workerA, workerB]);
// Throws: "Duplicate topic subscription attempted: topic.x by WorkerA"
```

---

## Adding a new worker — step by step

**Step 1 — Register the topic** in `libs/camunda-worker/src/lib/camunda-topics.config.ts`:

```typescript
export const CAMUNDA_TOPICS_CONFIG = {
  workers: {
    // existing entries...

    myNewWorker: {
      topic: 'topic.agent.my-new-worker',
      description: 'Does something useful for the process',
      enabled: true,
      options: {
        lockDuration: 30_000,
        maxRetryCount: 3,
        retryTimeoutMs: 10_000,
        variables: ['userId', 'someInput'],  // optional: only fetch these vars
      },
    },
  },
} as const;
```

**Step 2 — Create the worker class** in `apps/agent-workers/src/app/workers/my-new.worker.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { CamundaWorker, type HandlerArgs, Worker } from '@work-bench/camunda-worker';

@Injectable()
@Worker('myNewWorker')
export class MyNewWorker extends CamundaWorker {
  constructor(protected readonly logger: Logger) {
    super();
  }

  async run({ task, taskService }: HandlerArgs): Promise<void> {
    const userId = task.variables.get('userId') as string;

    // ... your logic ...

    await taskService.complete(task, { result: 'done' });
  }
}
```

**Step 3 — Register in the module** in `apps/agent-workers/src/app/app.module.ts`:

```typescript
// 1. Add to providers
providers: [
  ...,
  MyNewWorker,
  {
    provide: CAMUNDA_WORKERS_TOKEN,
    useFactory: (...existing, myNew: MyNewWorker) => [...existing, myNew],
    inject: [...existing, MyNewWorker],
  },
],
```

That's all. The decorator wires the topic and options; the startup service subscribes and starts polling; the base class handles logging and retries.

---

## API reference

All exports from `@work-bench/camunda-worker`:

| Export | Kind | Description |
|---|---|---|
| `CamundaWorker` | `abstract class` | Base class for all workers. Extend this and implement `run()`. |
| `Worker` | `function (decorator)` | `@Worker(key)` — wires topic + options from the config registry. |
| `CAMUNDA_TOPICS_CONFIG` | `const` | Central topic registry object. |
| `getWorkerConfig` | `function` | Look up a `WorkerConfig` by key, throws if missing. |
| `getTopicName` | `function` | Shorthand for `getWorkerConfig(key).topic`. |
| `getEnabledWorkers` | `function` | Returns all entries where `enabled !== false`. |
| `validateWorkerConfigurations` | `function` | Returns array of config errors (empty = valid). |
| `CamundaClientProvider` | `Provider` | NestJS provider; creates the Camunda client from env vars. |
| `CAMUNDA_CLIENT` | `string` | Injection token for the Camunda client. |
| `createCamundaClient` | `function` | Factory used by `CamundaClientProvider`; usable standalone. |
| `CamundaWorkersStartupService` | `class` | NestJS service; subscribes workers and manages polling lifecycle. |
| `CAMUNDA_WORKERS_TOKEN` | `string` | Injection token for the worker array. |
| `startSingleWorker` | `function` | Subscribe + start a single worker without the service. |
| `startMultipleWorkers` | `function` | Subscribe + start multiple workers; throws on duplicate topics. |
| `CamundaWorker` (interfaces) | `types` | `CamundaTask`, `CamundaTaskService`, `CamundaVariables`, `HandlerArgs`, `SubscribeOptions` |
| `WorkerConfig` | `interface` | Shape of a single entry in `CAMUNDA_TOPICS_CONFIG.workers`. |
| `CamundaTopicsConfig` | `interface` | Shape of the full `CAMUNDA_TOPICS_CONFIG` object. |
