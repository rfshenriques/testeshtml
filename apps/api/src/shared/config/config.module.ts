import { Global, Module } from '@nestjs/common';
import { Env, loadEnv } from './config';

export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }],
  exports: [ENV],
})
export class AppConfigModule {}

export type { Env };
