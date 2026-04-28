# Workflow Orchestration

## BPMN process: `workflow-v2.bpmn`

The file `workflow-v2.bpmn` defines the `health-ai-workflow` process deployed to Camunda 7. It converts every task from the original `workflow.bpmn` to a Camunda external task so that `agent-workers` handles the work.

## Process structure

```
Start Event
  └─► GetUserDetails        [external: topic.health.get-user-details]
        └─► ClassifyContent [external: topic.health.classify-content]
              └─► XOR Gateway (exclusive split — only ONE branch runs)
                    │
                    ├─► intent == 'HEALTH_REPORT'
                    │     └─► Health Report SubProcess
                    │           └─► extractHealthReport [external: topic.health.report.extract]
                    │                 └─► AND split (parallel gateway)
                    │                       ├─► saveHealthEvent      [external: topic.health.report.save-health-event]
                    │                       ├─► saveMedicationsDiet  [external: topic.health.report.save-medications-diet]
                    │                       ├─► saveHealthLifestyle  [external: topic.health.report.save-lifestyle]
                    │                       └─► saveTestResults      [external: topic.health.report.save-test-results]
                    │
                    ├─► intent == 'DIET_LOGS'
                    │     └─► Diet Logs SubProcess
                    │           ├─► analyzeDietContent [external: topic.health.diet.analyze]
                    │           └─► saveDietContent    [external: topic.health.diet.save]
                    │
                    ├─► intent == 'LIFESTYLE'
                    │     └─► Lifestyle SubProcess
                    │           ├─► analyzeLifestyle  [external: topic.health.lifestyle.analyze]
                    │           └─► saveLifestyle     [external: topic.health.lifestyle.save]
                    │
                    └─► intent == 'OTHERS'
                          └─► saveForReview [external: topic.health.others.save]
                                └─► Terminate End Event (bypasses StartAiSuggestions)

  (Health Report, Diet, Lifestyle paths) → XOR Join → StartAiSuggestions [external: start-ai-suggestor-topic]
                                                             └─► End Event
```

## XOR gateway condition expressions

The sequence flows leaving the XOR gateway use JUEL expressions evaluated by Camunda against the process instance variables:

```xml
<bpmn:conditionExpression>${intent == 'HEALTH_REPORT'}</bpmn:conditionExpression>
<bpmn:conditionExpression>${intent == 'DIET_LOGS'}</bpmn:conditionExpression>
<bpmn:conditionExpression>${intent == 'LIFESTYLE'}</bpmn:conditionExpression>
<bpmn:conditionExpression>${intent == 'OTHERS'}</bpmn:conditionExpression>
```

The `intent` variable is set by `ClassifyContentWorker` when it completes the `classifyContent` task.

## The Others path — no AI suggestions

When `intent == 'OTHERS'`, Camunda routes to the Others subprocess which contains only `saveForReview`. That task pushes the `done` SSE event directly to `camunda-streamer` before completing, because the BPMN routes to a **Terminate End Event** immediately after — `StartAiSuggestions` is never reached for general queries.

This is why `SaveForReviewWorker` is the only worker that calls `streamer.pushEvent(..., { type: 'done', ... })` directly. All other terminal responses come from `StartAiSuggestionsWorker`.

## Health Report parallel saves

Inside the Health Report subprocess, after `extractHealthReport` completes, an **AND (parallel) gateway** splits into 4 simultaneous tasks:
- `saveHealthEvent` — doctor visit and diagnosis record
- `saveMedicationsDiet` — diet/medication cards
- `saveHealthLifestyle` — lifestyle advice from the report
- `saveTestResults` — lab test results

All four run concurrently (Camunda polls them simultaneously). A corresponding AND join gateway waits for all four to complete before the subprocess ends and the flow reaches `StartAiSuggestions`.

## External task configuration

Every task in `workflow-v2.bpmn` is declared as:

```xml
<bpmn:serviceTask id="Activity_xxx" name="Task Name">
  <bpmn:extensionElements>
    <camunda:properties>
      <camunda:property name="workerKey" value="workerKeyName"/>
    </camunda:properties>
  </bpmn:extensionElements>
</bpmn:serviceTask>
```

with `camunda:type="external"` and `camunda:topic="topic.name"` attributes on the service task element.

## Process variable serialisation

All variables are passed as Camunda `String` type (even JSON payloads):

```typescript
// In CamundaService.startProcess():
variables: Object.fromEntries(
  Object.entries(variables).map(([k, v]) => [
    k,
    { value: v, type: typeof v === 'number' ? 'Integer' : 'String' },
  ]),
)
```

Workers read variables with `task.variables.get('varName') as string` and parse JSON where needed:

```typescript
const extractedHealthDataJson = task.variables.get('extractedHealthDataJson') as string;
let parsed: Record<string, unknown> = {};
try { parsed = JSON.parse(extractedHealthDataJson); } catch { /* skip */ }
```

## Retry and incident handling

`CamundaWorker.handler()` wraps `run()` with automatic failure reporting:

1. If `run()` throws, `handler()` calls `taskService.handleFailure()` with a calculated retry count
2. Retry count priority: `task.retries` (engine-managed) → `retryCount` process variable → `CAMUNDA_TOPICS_CONFIG` entry's `maxRetryCount`
3. When retries reach 0, Camunda creates an incident visible in the Camunda Cockpit
4. Workers do **not** catch errors inside `run()` — the base class owns failure reporting entirely

Retry timeouts per worker type:

| Category | Timeout |
|---|---|
| Fast API calls (save-*) | 5 s |
| LLM analysis workers | 10–15 s |
| LLM streaming (startAiSuggestions) | 30 s |

## Deploying the BPMN

```bash
curl -X POST http://localhost:8080/engine-rest/deployment/create \
  -F "deployment-name=health-ai-workflow" \
  -F "deploy-changed-only=true" \
  -F "data=@workflow-v2.bpmn"
```

Process key must be `health-ai-workflow` — this is what `CamundaService.startProcess()` uses:

```typescript
await this.camundaService.startProcess('health-ai-workflow', variables);
```
