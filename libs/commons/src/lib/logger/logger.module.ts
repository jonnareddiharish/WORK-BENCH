import { Module } from '@nestjs/common';
import { LoggerModule, type Params } from 'nestjs-pino';

const PINO_CONFIG: Params = {
  pinoHttp: {
    // pino-http's strict union type doesn't expose `transport` in some generics contexts;
    // cast to `any` here — the config is validated at runtime by pino-http itself.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(({
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
      level: process.env['LOG_LEVEL'] ?? 'debug',
      autoLogging: false,
    }) as any),
  },
};

@Module({
  imports: [LoggerModule.forRoot(PINO_CONFIG)],
  exports: [LoggerModule],
})
export class AppLoggerModule {}
