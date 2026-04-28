export interface WorkerConfig {
  topic: string;
  description: string;
  enabled?: boolean;
  options?: {
    lockDuration?: number;
    variables?: string[];
    processDefinitionId?: string;
    processDefinitionIdIn?: string[];
    processDefinitionKey?: string;
    processDefinitionKeyIn?: string[];
    processDefinitionVersionTag?: string;
    withoutTenantId?: boolean;
    tenantIdIn?: string[];
    businessKey?: string;
    processInstanceId?: string;
    processVariables?: Record<string, unknown>;
    deserializeValues?: boolean;
    localVariables?: boolean;
    includeExtensionProperties?: boolean;
    maxRetryCount?: number;
    retryTimeoutMs?: number;
  };
}

export interface CamundaTopicsConfig {
  workers: Record<string, WorkerConfig>;
}

/**
 * Central registry of all Camunda external task topics.
 * Add a new entry here for each worker class in this monorepo.
 * The key is passed to @Worker('key') to wire the topic and options.
 */
export const CAMUNDA_TOPICS_CONFIG: CamundaTopicsConfig = {
  workers: {
    // agent-workers app topics
    healthSummaryAnalysis: {
      topic: 'topic.agent.health-summary-analysis',
      description: 'Generates an AI health summary for a user',
      enabled: true,
      options: {
        lockDuration: 30_000,
        maxRetryCount: 3,
        retryTimeoutMs: 10_000,
      },
    },
    mealPlanGeneration: {
      topic: 'topic.agent.meal-plan-generation',
      description: 'Generates an AI meal plan for a user',
      enabled: true,
      options: {
        lockDuration: 60_000,
        maxRetryCount: 3,
        retryTimeoutMs: 15_000,
      },
    },

    // Health AI workflow workers (apps/agent-workers health-ai/)
    getUserDetails: {
      topic: 'topic.health.get-user-details',
      description: 'Fetches user profile and health context for the AI workflow session',
      enabled: true,
      options: { lockDuration: 10_000, maxRetryCount: 3, retryTimeoutMs: 5_000 },
    },
    classifyContent: {
      topic: 'topic.health.classify-content',
      description: 'Classifies user message into HEALTH_REPORT, DIET_LOGS, LIFESTYLE, or OTHERS',
      enabled: true,
      options: { lockDuration: 30_000, maxRetryCount: 3, retryTimeoutMs: 10_000 },
    },
    extractHealthReport: {
      topic: 'topic.health.report.extract',
      description: 'LLM structured extraction of medical report into ParsedHealthData',
      enabled: true,
      options: { lockDuration: 60_000, maxRetryCount: 3, retryTimeoutMs: 15_000 },
    },
    saveHealthEvent: {
      topic: 'topic.health.report.save-health-event',
      description: 'Saves doctor visit and diagnosis health event via API',
      enabled: true,
      options: { lockDuration: 15_000, maxRetryCount: 3, retryTimeoutMs: 5_000 },
    },
    saveMedicationsDiet: {
      topic: 'topic.health.report.save-medications-diet',
      description: 'Saves medication diet cards from extracted health report via API',
      enabled: true,
      options: { lockDuration: 15_000, maxRetryCount: 3, retryTimeoutMs: 5_000 },
    },
    saveHealthLifestyle: {
      topic: 'topic.health.report.save-lifestyle',
      description: 'Saves lifestyle advice from extracted health report via API',
      enabled: true,
      options: { lockDuration: 15_000, maxRetryCount: 3, retryTimeoutMs: 5_000 },
    },
    saveTestResults: {
      topic: 'topic.health.report.save-test-results',
      description: 'Saves lab test results from extracted health report via API',
      enabled: true,
      options: { lockDuration: 15_000, maxRetryCount: 3, retryTimeoutMs: 5_000 },
    },
    analyzeDietContent: {
      topic: 'topic.health.diet.analyze',
      description: 'LLM analysis of diet log content into structured diet data',
      enabled: true,
      options: { lockDuration: 30_000, maxRetryCount: 3, retryTimeoutMs: 10_000 },
    },
    saveDietContent: {
      topic: 'topic.health.diet.save',
      description: 'Saves analyzed diet log via API',
      enabled: true,
      options: { lockDuration: 15_000, maxRetryCount: 3, retryTimeoutMs: 5_000 },
    },
    analyzeLifestyle: {
      topic: 'topic.health.lifestyle.analyze',
      description: 'LLM analysis of lifestyle content into structured lifestyle data',
      enabled: true,
      options: { lockDuration: 30_000, maxRetryCount: 3, retryTimeoutMs: 10_000 },
    },
    saveLifestyle: {
      topic: 'topic.health.lifestyle.save',
      description: 'Saves analyzed lifestyle record via API',
      enabled: true,
      options: { lockDuration: 15_000, maxRetryCount: 3, retryTimeoutMs: 5_000 },
    },
    saveForReview: {
      topic: 'topic.health.others.save',
      description: 'Handles general queries that do not match health record categories',
      enabled: true,
      options: { lockDuration: 10_000, maxRetryCount: 3, retryTimeoutMs: 5_000 },
    },
    startAiSuggestions: {
      topic: 'start-ai-suggestor-topic',
      description: 'Runs LLM AI synthesis and streams tokens to SSE clients via camunda-streamer',
      enabled: true,
      options: { lockDuration: 90_000, maxRetryCount: 1, retryTimeoutMs: 30_000 },
    },
  },
};

/** Returns the config for a worker key, throws if not found. */
export function getWorkerConfig(workerKey: string): WorkerConfig {
  const config = CAMUNDA_TOPICS_CONFIG.workers[workerKey];
  if (!config) {
    throw new Error(
      `Worker configuration not found for key: ${workerKey}. Available keys: ${Object.keys(CAMUNDA_TOPICS_CONFIG.workers).join(', ')}`,
    );
  }
  return config;
}

/** Returns the topic name for a worker key. */
export function getTopicName(workerKey: string): string {
  return getWorkerConfig(workerKey).topic;
}

/** Returns all enabled worker entries. */
export function getEnabledWorkers(): Array<{ key: string; config: WorkerConfig }> {
  return Object.entries(CAMUNDA_TOPICS_CONFIG.workers)
    .filter(([, config]) => config.enabled !== false)
    .map(([key, config]) => ({ key, config }));
}

/** Validates all worker configurations and returns an array of error messages. */
export function validateWorkerConfigurations(): string[] {
  const errors: string[] = [];
  const topics = new Set<string>();

  for (const [key, config] of Object.entries(CAMUNDA_TOPICS_CONFIG.workers)) {
    if (topics.has(config.topic)) {
      errors.push(`Duplicate topic '${config.topic}' found for worker '${key}'`);
    }
    topics.add(config.topic);

    if (!config.topic) {
      errors.push(`Worker '${key}' is missing topic`);
    }
    if (!config.description) {
      errors.push(`Worker '${key}' is missing description`);
    }
  }

  return errors;
}
