import { Inject, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';

import { CAMUNDA_CLIENT } from './camunda-client.provider';
import type CamundaWorker from './camunda-worker';

export const CAMUNDA_WORKERS_TOKEN = 'CAMUNDA_WORKERS';

/**
 * Bootstraps all registered Camunda workers by subscribing them to their topics
 * and starting the polling client. Inject workers via the CAMUNDA_WORKERS_TOKEN
 * multi-provider token.
 */
@Injectable()
export class CamundaWorkersStartupService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  constructor(
    @Inject(CAMUNDA_CLIENT) private readonly client: ReturnType<typeof import('./camunda-client.provider').createCamundaClient>,
    @Inject(CAMUNDA_WORKERS_TOKEN) private readonly workers: CamundaWorker[],
  ) {
    for (const worker of this.workers) {
      this.client.subscribe(worker.topic, worker.options, worker.handler.bind(worker));
    }
  }

  onApplicationBootstrap(): void {
    this.client.start();
  }

  onApplicationShutdown(): void {
    for (const worker of this.workers) {
      this.client.unsubscribe(worker.topic);
    }
    this.client.stop();
  }
}

/** Subscribe and start a single worker without the full startup service. */
export function startSingleWorker(client: ReturnType<typeof import('./camunda-client.provider').createCamundaClient>, worker: CamundaWorker): void {
  client.subscribe(worker.topic, worker.options, worker.handler.bind(worker));
  client.start();
}

/** Subscribe multiple workers and start polling. Throws on duplicate topic registration. */
export function startMultipleWorkers(
  client: ReturnType<typeof import('./camunda-client.provider').createCamundaClient>,
  workers: CamundaWorker[],
): void {
  const subscribedTopics = new Set<string>();

  for (const worker of workers) {
    if (subscribedTopics.has(worker.topic)) {
      throw new Error(
        `Duplicate topic subscription attempted: ${worker.topic} by ${worker.constructor.name}`,
      );
    }
    subscribedTopics.add(worker.topic);
    client.subscribe(worker.topic, worker.options, worker.handler.bind(worker));
  }

  client.start();
}
