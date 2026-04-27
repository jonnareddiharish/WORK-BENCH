import { Logger } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client, BasicAuthInterceptor } = require('camunda-external-task-client-js');

interface CamundaConfig {
  baseUrl?: string;
  workerId?: string;
  autoPoll?: boolean;
  maxTasks?: number;
  lockDuration?: number;
  retryTimeout?: number;
  asyncResponseTimeout?: number;
  maxParallelExecutions?: number;
  interval?: number;
  // biome-ignore lint/suspicious/noExplicitAny: BasicAuthInterceptor has no type definitions
  interceptors?: any;
}

function createClientWithEventHandlers(config: CamundaConfig, logger: Logger) {
  const client = new Client(config);

  client.on('subscribe', (topic: string) => {
    logger.debug(`Subscribed to Camunda topic: ${topic}`);
  });

  client.on('unsubscribe', (topic: string) => {
    logger.debug(`Unsubscribed from Camunda topic: ${topic}`);
  });

  client.on('poll:start', () => {
    logger.debug('Camunda polling started');
  });

  client.on('poll:stop', () => {
    logger.debug('Camunda polling stopped');
  });

  client.on('poll:success', (tasks: unknown[]) => {
    if (tasks && tasks.length > 0) {
      logger.debug(`Received ${tasks.length} tasks from Camunda`);
    }
  });

  client.on('poll:error', (error: Error) => {
    logger.error('Camunda polling error', { message: error.message, stack: error.stack });
    if (error.message?.includes('401')) {
      logger.error('Authentication failed! Check CAMUNDA_USERNAME and CAMUNDA_PASSWORD', {
        baseUrl: config.baseUrl,
      });
    }
  });

  return client;
}

export function createCamundaClient(configService: ConfigService, logger: Logger) {
  const baseUrl = configService.get<string>('CAMUNDA_URI');
  const username = configService.get<string>('CAMUNDA_USERNAME');
  const password = configService.get<string>('CAMUNDA_PASSWORD');

  const appWorkerId =
    configService.get<string>('CAMUNDA_APP_WORKER_ID') ||
    `app-${Math.random().toString(36).substring(2, 11)}`;

  logger.debug('Creating Camunda client with config', {
    baseUrl,
    username: username ? '***PROVIDED***' : 'NOT_SET',
    password: password ? '***PROVIDED***' : 'NOT_SET',
    appWorkerId,
    hasAuth: !!(username && password),
  });

  const camundaConfig: CamundaConfig = {
    baseUrl,
    workerId: appWorkerId,
    autoPoll: true,
    maxTasks: configService.get<number>('CAMUNDA_MAX_TASKS') || 10,
    lockDuration: configService.get<number>('CAMUNDA_LOCK_DURATION') || 5_000,
    retryTimeout: configService.get<number>('CAMUNDA_RETRY_TIMEOUT') || 2_000,
    asyncResponseTimeout: configService.get<number>('CAMUNDA_ASYNC_RESPONSE_TIMEOUT') || 5_000,
    maxParallelExecutions: configService.get<number>('CAMUNDA_MAX_PARALLEL_EXECUTIONS') || 10,
    interval: configService.get<number>('CAMUNDA_INTERVAL') || 500,
  };

  if (username && password) {
    logger.debug('Adding BasicAuth interceptor with credentials');
    camundaConfig.interceptors = new BasicAuthInterceptor({ username, password });
  } else {
    logger.warn('No authentication credentials provided - connecting without auth');
  }

  return createClientWithEventHandlers(camundaConfig, logger);
}

/** NestJS provider token for the Camunda external task client. */
export const CAMUNDA_CLIENT = 'CAMUNDA_CLIENT';

/** NestJS provider that creates a Camunda Client via the ConfigService. */
export const CamundaClientProvider: Provider = {
  provide: CAMUNDA_CLIENT,
  useFactory: createCamundaClient,
  inject: [ConfigService, Logger],
};
