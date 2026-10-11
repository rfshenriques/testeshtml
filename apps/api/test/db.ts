import { PrismaClient } from '@sitewright/db';

/** Truncate every application table (keeps _prisma_migrations). Use in beforeEach/beforeAll of integration tests. */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const names = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  if (names) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}
