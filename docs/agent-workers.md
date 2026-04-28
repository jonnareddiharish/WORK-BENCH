# Agent Workers

`apps/agent-workers/` — NestJS process that polls Camunda 7 and processes external service tasks. It has no HTTP server of its own; it only makes outbound calls (to Camunda, to `camunda-streamer`, and to `apps/api`).

## Startup

`main.ts` bootstraps NestJS with `app.init()` (no `app.listen()` needed — no HTTP server). `CamundaWorkersStartupService` subscribes all registered workers to their Camunda topics at startup and unsubscribes cleanly on shutdown.

## Worker base class

All workers extend `CamundaWorker` from `@work-bench/camunda-worker` and are decorated with `@Worker('key')`:

```typescript
@Injectable()
@Worker('getUserDetails')          // key must exist in CAMUNDA_TOPICS_CONFIG
export class GetUserDetailsWorker extends CamundaWorker {
  constructor(
    protected readonly logger: Logger,  // required by base class
    private readonly streamer: StreamerClientService,
    private readonly cfg: ConfigService,
  ) { super(); }

  async run({ task, taskService }: HandlerArgs): Promise<void> {
    // ... task logic ...
    await taskService.complete(task, { outputVariable: value });
  }
}
```

The `@Worker` decorator reads `CAMUNDA_TOPICS_CONFIG` at class-load time, stamps `topic`, `options`, and retry config onto the instance, and fails fast at boot if the key is missing.

Workers implement **only** `run()`. Error handling, retry counting, and incident raising are owned by `CamundaWorker.handler()`.

## Shared services

### LlmService (`services/llm.service.ts`)

Multi-model LLM factory. Instantiates the correct LangChain chat model based on `modelId` and caches it in a `Map`:

| Model prefix | LangChain class | API key env var |
|---|---|---|
| `claude*` | `ChatAnthropic` | `ANTHROPIC_API_KEY` |
| `gpt*` | `ChatOpenAI` | `OPENAI_API_KEY` |
| `gemini*` | `ChatGoogleGenerativeAI` | `GOOGLE_API_KEY` |
| `llama*`, `gemma*`, `mixtral*`, `qwen*`, `deepseek*` | `ChatGroq` | `GROQ_API_KEY` |
| (unknown) | `ChatAnthropic` (fallback) | `ANTHROPIC_API_KEY` |

All models are instantiated with `temperature: 0`.

`chunkText(content)` extracts a plain string from a LangChain streaming chunk — handles both raw string content and the `[{ type: 'text', text: '...' }]` array format used by Anthropic multimodal responses.

### StreamerClientService (`services/streamer-client.service.ts`)

Posts events back to `camunda-streamer`'s internal endpoint. Uses Node.js 22+ native `fetch()`.

```typescript
// Send any WorkflowEvent
await streamer.pushEvent(sessionId, { type: 'token', content: 'Hello ' });

// Convenience wrapper for progress steps
await streamer.pushStep(sessionId, 'Analyzing report...', 'processing');
await streamer.pushStep(sessionId, 'Analyzing report...', 'done');
```

Network errors are caught and logged as warnings — a failed push does not fail the worker task.

## All 15 workers

### 1. GetUserDetailsWorker — `getUserDetails`

**Topic**: `topic.health.get-user-details` | **Lock**: 10 s

Calls `GET /api/users/:userId` and sets `userDetailsJson` (the full user document as a JSON string). Used downstream by `StartAiSuggestionsWorker` to build the patient profile context.

```
Reads:  userId
Sets:   userDetailsJson
Steps:  "Fetching your health profile..."
```

---

### 2. ClassifyContentWorker — `classifyContent`

**Topic**: `topic.health.classify-content` | **Lock**: 30 s | **Uses LLM**: Yes

Determines what kind of health input the user sent and extracts text from files.

**File extraction** (when `inputType != 'TEXT'`):
- `application/pdf` → `pdf-parse` extracts text from the base64 buffer
- `image/*` → LLM vision call (multimodal `HumanMessage` with `image_url` content block) extracts all medical information as structured text

**Intent classification** — LLM call with a simple system prompt asking for exactly one of: `HEALTH_REPORT | DIET_LOGS | LIFESTYLE | OTHERS`.

```
Reads:  userMessage, inputType, fileBase64?, fileMimeType?, modelId?
Sets:   processedContent (extracted text or original message), intent (one of four values)
Steps:  "Understanding your message..."
```

---

### 3. HealthReportExtractionWorker — `extractHealthReport`

**Topic**: `topic.health.report.extract` | **Lock**: 60 s | **Uses LLM**: Yes

Runs a structured medical extraction prompt against the processed content. The system prompt requests a specific JSON shape covering: `visitDate`, `doctorInfo`, `visitSummary`, `prescriptions`, `testResults`, `dietAdvice`, `lifestyleAdvice`, `nextAppointment`, `followUpTests`, `newConditions`, `newMedications`.

`extractJson()` strips markdown fences and finds the first complete `{...}` block in the LLM response.

```
Reads:  processedContent, userDetailsJson (for patient name/conditions context), modelId?
Sets:   extractedHealthDataJson (full ParsedHealthData as JSON string)
Steps:  "Analyzing your health report..."
```

---

### 4. SaveHealthEventWorker — `saveHealthEvent`

**Topic**: `topic.health.report.save-health-event` | **Lock**: 15 s

Parses `extractedHealthDataJson` and posts a `DOCTOR_VISIT` health event to `POST /api/users/:userId/health-events`.

The payload includes: `visitDate`, `doctorInfo`, `visitSummary`, `prescriptions` (items), `testResults` (items), `nextAppointment`, `followUpTests`, `newConditions`, `newMedications`.

```
Reads:  extractedHealthDataJson, userId
Sets:   nothing
Steps:  "Saving your health record..."
```

---

### 5. SaveMedicationsDietWorker — `saveMedicationsDiet`

**Topic**: `topic.health.report.save-medications-diet` | **Lock**: 15 s

Iterates over `extractedHealthDataJson.dietAdvice[]` and posts each card to `POST /api/users/:userId/diet-logs`. Each entry gets `source: 'AI'` and `date` from `visitDate` (or `now`).

```
Reads:  extractedHealthDataJson, userId
Sets:   nothing
Steps:  "Saving medication schedule..."
```

---

### 6. SaveHealthLifestyleWorker — `saveHealthLifestyle`

**Topic**: `topic.health.report.save-lifestyle` | **Lock**: 15 s

Iterates over `extractedHealthDataJson.lifestyleAdvice[]` and posts each entry to `POST /api/users/:userId/lifestyle`.

```
Reads:  extractedHealthDataJson, userId
Sets:   nothing
Steps:  "Saving lifestyle recommendations..."
```

---

### 7. SaveTestResultsWorker — `saveTestResults`

**Topic**: `topic.health.report.save-test-results` | **Lock**: 15 s

Iterates over `extractedHealthDataJson.testResults.items[]` and posts each as a `LAB_TEST` health event to `POST /api/users/:userId/health-events`.

```
Reads:  extractedHealthDataJson, userId
Sets:   nothing
Steps:  "Saving test results..."
```

---

### 8. AnalyzeDietContentWorker — `analyzeDietContent`

**Topic**: `topic.health.diet.analyze` | **Lock**: 30 s | **Uses LLM**: Yes

LLM structured analysis of diet log content. Returns a JSON object with `description` (summary), `mealTypes`, `foodItems`, `calories`, and nutritional observations.

```
Reads:  processedContent, userDetailsJson, modelId?
Sets:   analyzedDietJson
Steps:  "Analyzing your diet information..."
```

---

### 9. SaveDietContentWorker — `saveDietContent`

**Topic**: `topic.health.diet.save` | **Lock**: 15 s

Posts the analyzed diet data from `analyzedDietJson` to `POST /api/users/:userId/diet-logs` with `source: 'AI'`.

```
Reads:  analyzedDietJson, userId
Sets:   nothing
Steps:  "Saving your diet log..."
```

---

### 10. AnalyzeLifestyleWorker — `analyzeLifestyle`

**Topic**: `topic.health.lifestyle.analyze` | **Lock**: 30 s | **Uses LLM**: Yes

LLM structured analysis of lifestyle content. Returns a JSON object with `description`, `categories` (EXERCISE/SLEEP/STRESS/HABITS), and key observations.

```
Reads:  processedContent, userDetailsJson, modelId?
Sets:   analyzedLifestyleJson
Steps:  "Analyzing your lifestyle information..."
```

---

### 11. SaveLifestyleWorker — `saveLifestyle`

**Topic**: `topic.health.lifestyle.save` | **Lock**: 15 s

Posts the analyzed lifestyle data from `analyzedLifestyleJson` to `POST /api/users/:userId/lifestyle` with `source: 'AI'`.

```
Reads:  analyzedLifestyleJson, userId
Sets:   nothing
Steps:  "Saving your lifestyle record..."
```

---

### 12. SaveForReviewWorker — `saveForReview`

**Topic**: `topic.health.others.save` | **Lock**: 10 s

Handles the "Others" path — messages that don't match any health category. **This is the only worker that pushes a `done` event directly** (instead of `StartAiSuggestionsWorker` doing it), because the BPMN routes the Others path to a Terminate End Event that bypasses `StartAiSuggestions`.

Pushes a canned acknowledgment reply so the SSE stream closes cleanly with a response.

```
Reads:  sessionId, userId, processedContent
Sets:   nothing (does not feed StartAiSuggestions)
Events: pushEvent(sessionId, { type: 'done', content: '...', intent: ['OTHERS'], userId })
Steps:  "Saving your message for review..."
```

---

### 13. StartAiSuggestionsWorker — `startAiSuggestions`

**Topic**: `start-ai-suggestor-topic` | **Lock**: 90 s | **Uses LLM**: Yes (streaming)

The terminal worker for Health Report, Diet, and Lifestyle paths. Assembles full context from all prior workers and streams an AI response token-by-token to the browser.

**System prompt assembly**:
```
Patient profile: Name | Conditions | Allergies | Medications
Recent data (if available):
  - Health report summary (from extractedHealthDataJson.visitSummary)
  - Diet analysis description (from analyzedDietJson.description)
  - Lifestyle analysis description (from analyzedLifestyleJson.description)
```

**Token streaming**:
```typescript
const stream = await llm.stream([new SystemMessage(systemPrompt), new HumanMessage(processedContent)]);
for await (const chunk of stream) {
  const token = this.llmService.chunkText(chunk.content);
  if (token) {
    fullResponse += token;
    await this.streamer.pushEvent(sessionId, { type: 'token', content: token });
  }
}
await this.streamer.pushEvent(sessionId, { type: 'done', content: fullResponse, intent: [intent], userId });
```

If the LLM stream fails, an `error` event is pushed and the task completes immediately (no retry for streaming errors).

```
Reads:  sessionId, userId, userMessage, intent, userDetailsJson, processedContent, modelId?
        extractedHealthDataJson?, analyzedDietJson?, analyzedLifestyleJson?
Events: token (many), done (one)
Steps:  "Generating AI response..."
```

---

### Legacy workers (unchanged)

| Worker | Topic | Purpose |
|---|---|---|
| `HealthSummaryWorker` | `topic.agent.health-summary-analysis` | AI health summary generation |
| `MealPlanGenerationWorker` | `topic.agent.meal-plan-generation` | AI meal plan generation |

These existed before the Camunda workflow redesign and are unmodified.

## App module wiring

Every worker must appear in `app.module.ts` in two places:

```typescript
@Module({
  providers: [
    Logger,
    CamundaClientProvider,
    LlmService,
    StreamerClientService,

    GetUserDetailsWorker,   // 1. provider registration (enables DI)
    // ... all other workers ...

    {
      provide: CAMUNDA_WORKERS_TOKEN,
      useFactory: (getUserDetails: GetUserDetailsWorker, /* ... */) =>
        [getUserDetails, /* ... */],           // 2. collected into the workers array
      inject: [GetUserDetailsWorker, /* ... */],
    },

    CamundaWorkersStartupService,
  ],
})
export class AppModule {}
```

`CamundaWorkersStartupService` receives the `CAMUNDA_WORKERS_TOKEN` array and subscribes each worker's `handler()` to its Camunda topic at startup.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `CAMUNDA_URI` | `http://localhost:8080/engine-rest` | Camunda 7 REST engine |
| `CAMUNDA_USERNAME` | — | Optional Basic Auth |
| `CAMUNDA_PASSWORD` | — | Optional Basic Auth |
| `CAMUNDA_APP_WORKER_ID` | auto-generated | Unique worker client ID |
| `CAMUNDA_STREAMER_URL` | `http://localhost:3001` | Where workers push events |
| `INTERNAL_AUTH_HEADER` | — | Secret for `x-internal-secret` header |
| `API_BASE_URL` | `http://localhost:3000/api` | Backend API for save-* workers |
| `ANTHROPIC_API_KEY` | — | Required for Claude models |
| `OPENAI_API_KEY` | — | Required for GPT models |
| `GROQ_API_KEY` | — | Required for Llama/Groq models |
| `GOOGLE_API_KEY` | — | Required for Gemini models |
