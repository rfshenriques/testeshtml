import { INestApplicationContext } from '@nestjs/common';
import { HealthService } from '../modules/ops/health.service';

export type CliCommand = (app: INestApplicationContext, args: string[]) => Promise<number>;

export const commands: Record<string, { description: string; run: CliCommand }> = {
  health: {
    description: 'Print the health report',
    run: async (app) => {
      console.log(JSON.stringify(await app.get(HealthService).check(), null, 2));
      return 0;
    },
  },
};

export async function runCli(app: INestApplicationContext, argv: string[]): Promise<number> {
  const [name, ...rest] = argv;
  const cmd = name ? commands[name] : undefined;
  if (!cmd) {
    console.log('Usage: pnpm cli <command> [args]\n');
    for (const [k, v] of Object.entries(commands)) console.log(`  ${k.padEnd(18)} ${v.description}`);
    return name ? 1 : 0;
  }
  return cmd.run(app, rest);
}
