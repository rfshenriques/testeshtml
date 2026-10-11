import { execSync } from 'node:child_process';
import * as path from 'node:path';
import './setup-env';

/**
 * Apply the committed migrations to the (local, throwaway) test database once per jest run.
 * This is non-destructive; individual test files truncate the tables they use via test/db.ts.
 */
export default async function globalSetup() {
  const prismaDir = path.resolve(__dirname, '../../../prisma');
  execSync('pnpm exec prisma migrate deploy', {
    cwd: prismaDir,
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'pipe',
  });
}
