import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { ENV, Env } from '../config/config.module';

/** Structured JSON logs with a correlation id on every request (spec §14). */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          genReqId: (req) => (req.headers['x-correlation-id'] as string) ?? randomUUID(),
          customProps: (req: any) => ({ correlationId: req.id }),
          autoLogging: env.NODE_ENV !== 'test',
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        },
      }),
    }),
  ],
})
export class LoggingModule {}
