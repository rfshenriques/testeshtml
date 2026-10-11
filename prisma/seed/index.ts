import { PrismaClient } from '@prisma/client';
import { JURISDICTIONS } from './jurisdictions';
import { DEFAULT_PRICING, DEFAULT_SEQUENCE } from './defaults';

const prisma = new PrismaClient();

async function main() {
  for (const j of JURISDICTIONS) {
    await prisma.jurisdictionPolicy.upsert({
      where: { countryCode: j.countryCode },
      create: j,
      update: j,
    });
  }
  await prisma.pricingConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', config: DEFAULT_PRICING as object },
    update: {},
  });
  await prisma.sequenceConfig.upsert({
    where: { id: 'default' },
    create: { id: 'default', steps: DEFAULT_SEQUENCE as object },
    update: {},
  });
  console.log(`Seeded ${JURISDICTIONS.length} jurisdiction policies, default pricing and sequence.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
