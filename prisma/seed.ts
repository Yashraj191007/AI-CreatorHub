import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

// Using the same config as the app to ensure consistency
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:51214/template1';
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database plans idempotently...');

  // 1. Seed Basic Plan (preserves existing price if plan already exists)
  const basicPlan = await prisma.plan.upsert({
    where: { name: 'Basic' },
    update: {},
    create: {
      name: 'Basic',
      price: 9.99,
      features: {
        create: [
          { description: 'Access to basic AI tools' },
          { description: 'Standard support' },
        ],
      },
    },
  });

  const basicFeatureCount = await prisma.planFeature.count({ where: { planId: basicPlan.id } });
  if (basicFeatureCount === 0) {
    await prisma.planFeature.createMany({
      data: [
        { planId: basicPlan.id, description: 'Access to basic AI tools' },
        { planId: basicPlan.id, description: 'Standard support' },
      ],
    });
  }

  // 2. Seed Pro Plan (preserves existing price if plan already exists)
  const proPlan = await prisma.plan.upsert({
    where: { name: 'Pro' },
    update: {},
    create: {
      name: 'Pro',
      price: 29.99,
      features: {
        create: [
          { description: 'Access to advanced AI tools' },
          { description: 'Priority support' },
          { description: 'Unlimited generations' },
        ],
      },
    },
  });

  const proFeatureCount = await prisma.planFeature.count({ where: { planId: proPlan.id } });
  if (proFeatureCount === 0) {
    await prisma.planFeature.createMany({
      data: [
        { planId: proPlan.id, description: 'Access to advanced AI tools' },
        { planId: proPlan.id, description: 'Priority support' },
        { planId: proPlan.id, description: 'Unlimited generations' },
      ],
    });
  }

  console.log('Database plans verified and seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
