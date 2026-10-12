#!/bin/sh
# Boot sequence for the container: migrations → base seed (idempotent) → optional demo data → API.
set -e
cd /app/prisma
pnpm exec prisma migrate deploy
pnpm exec tsx seed/index.ts
cd /app/apps/api
if [ "$DEMO_SEED" = "true" ]; then
  node -e "
    const { PrismaClient } = require('@sitewright/db');
    const p = new PrismaClient();
    p.campaign.count().then((n) => { process.exit(n > 0 ? 0 : 3); }).finally(() => p.\$disconnect());
  " || WORKERS=off node dist/cli.js demo-seed
fi
exec node dist/main.js
