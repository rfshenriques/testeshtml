import 'reflect-metadata';
import { loadDotenv } from './shared/config/load-dotenv';
loadDotenv();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { runCli } from './cli/commands';

/** Operator CLI: `pnpm cli <command> [...args]`. See src/cli/commands.ts. */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const code = await runCli(app, process.argv.slice(2));
    await app.close();
    process.exit(code);
  } catch (e) {
    console.error(e);
    await app.close();
    process.exit(1);
  }
}
main();
