import { Logger } from '@nestjs/common';

import { CAMUNDA_TOPICS_CONFIG } from './camunda-topics.config';

// Variable names used to pass retry config via Camunda process variables
const RETRY_COUNT_VARIABLE = 'retryCount';
const RETRY_TIMEOUT_VARIABLE = 'retryTimeout';

export interface CamundaVariables {
  getAll(): Record<string, unknown>;
  get(name: string): unknown;
}

export interface CamundaTask {
  id: string;
  topicName: string;
  processDefinitionKey: string;
  processInstanceId: string;
  retries?: number;
  variables: CamundaVariables;
  businessKey: string;
}

export interface CamundaTaskService {
  complete(task: CamundaTask, variables?: Record<string, unknown>): Promise<void>;
  handleFailure(
    task: CamundaTask,
    options: {
      retries?: number;
      retryTimeout?: number;
      errorMessage?: string;
      errorDetails?: string;
    },
  ): Promise<void>;
}

export interface HandlerArgs {
  task: CamundaTask;
  taskService: CamundaTaskService;
}

export interface SubscribeOptions {
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
}

/**
 * The base class to be extended by all Camunda external task workers.
 * Subclasses must implement `run()` and receive `logger` via their constructor.
 */
export default abstract class CamundaWorker {
  /** Set by the @Worker decorator from CAMUNDA_TOPICS_CONFIG. */
  topic!: string;

  /** Subscribe options set by the @Worker decorator. */
  options: SubscribeOptions = {};

  /** Fallback max retries if not set in config. */
  maxRetryCount = 3;

  /** Fallback retry delay (ms) if not set in config. */
  retryTimeoutMs = 10_000;

  // Injected by the subclass constructor as a protected parameter.
  protected logger!: Logger;

  private getConfiguredRetryCount(): number {
    try {
      const entry = Object.entries(CAMUNDA_TOPICS_CONFIG.workers).find(
        ([, config]) => config.topic === this.topic,
      );
      return entry?.[1].options?.maxRetryCount ?? this.maxRetryCount;
    } catch {
      return this.maxRetryCount;
    }
  }

  private getConfiguredRetryTimeout(): number {
    try {
      const entry = Object.entries(CAMUNDA_TOPICS_CONFIG.workers).find(
        ([, config]) => config.topic === this.topic,
      );
      return entry?.[1].options?.retryTimeoutMs ?? this.retryTimeoutMs;
    } catch {
      return this.retryTimeoutMs;
    }
  }

  /** Implement the actual task logic here. */
  abstract run({ task, taskService }: HandlerArgs): Promise<void>;

  /**
   * Called by the Camunda client for each fetched task.
   * Wraps `run()` with logging and automatic failure/retry handling.
   */
  async handler({ task, taskService }: HandlerArgs): Promise<void> {
    const taskString = `task [${task.id}] with topic [${task.topicName}] for process [${task.processDefinitionKey}]`;
    try {
      this.logger.log(`Starting ${taskString}`);
      await this.run({ task, taskService });
      this.logger.log(`Finished ${taskString}`);
    } catch (error) {
      const retryCountFromVariable = task.variables.get(RETRY_COUNT_VARIABLE);
      const retryTimeoutFromVariable = task.variables.get(RETRY_TIMEOUT_VARIABLE);

      let retriesRemaining: number;
      if (typeof task.retries === 'number') {
        retriesRemaining = task.retries - 1;
      } else if (typeof retryCountFromVariable === 'number') {
        retriesRemaining = retryCountFromVariable;
      } else {
        retriesRemaining = this.getConfiguredRetryCount();
      }

      if (retriesRemaining > 0) {
        this.logger.warn(`(Will be retried) Error during ${taskString}`, { error });
      } else {
        this.logger.error(`Raising incident for error during ${taskString}`, {
          camundaIncident: true,
          camundaProcessId: task.processInstanceId,
          error,
        });
      }

      await taskService.handleFailure(task, {
        retries: retriesRemaining,
        retryTimeout:
          typeof retryTimeoutFromVariable === 'number'
            ? retryTimeoutFromVariable
            : this.getConfiguredRetryTimeout(),
        errorMessage: (error as Error).message,
        errorDetails: (error as Error).stack,
      });
      throw error;
    }
  }
}
