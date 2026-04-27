import { getWorkerConfig } from './camunda-topics.config';
import type CamundaWorker from './camunda-worker';

/**
 * Class decorator that wires a worker subclass to its Camunda topic and options
 * from CAMUNDA_TOPICS_CONFIG. Apply above @Injectable().
 *
 * @example
 * \@Injectable()
 * \@Worker('healthSummaryAnalysis')
 * export class HealthSummaryWorker extends CamundaWorker { ... }
 */
// biome-ignore lint/suspicious/noExplicitAny: Decorator must accept constructors with any parameter types for DI compatibility
export default function Worker(workerKey: string) {
  // biome-ignore lint/suspicious/noExplicitAny: Decorator must accept constructors with any parameter types for DI compatibility
  return <T extends { new (...args: any[]): CamundaWorker }>(TargetClass: T): T => {
    const config = getWorkerConfig(workerKey);
    // biome-ignore lint/suspicious/noExplicitAny: Required for dynamic constructor wrapping pattern
    const originalConstructor = TargetClass as any;

    function WrappedConstructor(...args: unknown[]) {
      const instance = new originalConstructor(...args);

      instance.topic = config.topic;
      instance.maxRetryCount = config.options?.maxRetryCount ?? 3;
      instance.retryTimeoutMs = config.options?.retryTimeoutMs ?? 10_000;
      instance.options = {
        lockDuration: config.options?.lockDuration,
        variables: config.options?.variables,
        processDefinitionId: config.options?.processDefinitionId,
        processDefinitionIdIn: config.options?.processDefinitionIdIn,
        processDefinitionKey: config.options?.processDefinitionKey,
        processDefinitionKeyIn: config.options?.processDefinitionKeyIn,
        processDefinitionVersionTag: config.options?.processDefinitionVersionTag,
        withoutTenantId: config.options?.withoutTenantId,
        tenantIdIn: config.options?.tenantIdIn,
        businessKey: config.options?.businessKey,
        processInstanceId: config.options?.processInstanceId,
        processVariables: config.options?.processVariables,
        deserializeValues: config.options?.deserializeValues,
        localVariables: config.options?.localVariables,
        includeExtensionProperties: config.options?.includeExtensionProperties,
      };

      return instance;
    }

    WrappedConstructor.prototype = originalConstructor.prototype;
    Object.defineProperty(WrappedConstructor, 'name', { value: TargetClass.name });

    // Copy all static metadata (needed for NestJS DI reflection)
    Object.getOwnPropertyNames(originalConstructor).forEach((prop) => {
      if (!['length', 'prototype', 'name', 'caller', 'arguments'].includes(prop)) {
        try {
          Object.defineProperty(
            WrappedConstructor,
            prop,
            Object.getOwnPropertyDescriptor(originalConstructor, prop)!,
          );
        } catch {
          // skip non-configurable properties
        }
      }
    });

    return WrappedConstructor as unknown as T;
  };
}
