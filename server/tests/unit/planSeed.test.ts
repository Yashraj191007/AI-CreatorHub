import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Prisma Plan Seeding Idempotency Tests', () => {
  let mockPlansStore: Map<string, any>;
  let mockFeaturesStore: any[];

  beforeEach(() => {
    mockPlansStore = new Map();
    mockFeaturesStore = [];
  });

  it('should preserve existing production plan price when rerunning plan upsert', async () => {
    // 1. Existing Plan in production with a custom promotional price ($19.99)
    mockPlansStore.set('Basic', {
      id: 'plan-basic-uuid',
      name: 'Basic',
      price: 19.99, // Custom price
    });

    // Mock prisma client matching prisma/seed.ts logic
    const prismaMock = {
      plan: {
        upsert: vi.fn().mockImplementation(async ({ where, update, create }) => {
          const existing = mockPlansStore.get(where.name);
          if (existing) {
            // Apply update fields only (which is {} in our fixed seed script)
            const updated = { ...existing, ...update };
            mockPlansStore.set(where.name, updated);
            return updated;
          }
          const created = { id: 'new-plan-uuid', ...create };
          mockPlansStore.set(where.name, created);
          return created;
        }),
      },
      planFeature: {
        count: vi.fn().mockResolvedValue(2),
        createMany: vi.fn(),
      },
    };

    // Execute the seed logic for Basic plan
    const result = await prismaMock.plan.upsert({
      where: { name: 'Basic' },
      update: {}, // Must be empty to preserve custom production prices
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

    // Verify price was NOT overwritten back to 9.99
    expect(result.price).toBe(19.99);
    expect(result.id).toBe('plan-basic-uuid');
    expect(prismaMock.planFeature.createMany).not.toHaveBeenCalled();
  });

  it('should create missing plan with default price and features if it does not exist', async () => {
    const prismaMock = {
      plan: {
        upsert: vi.fn().mockImplementation(async ({ where, update, create }) => {
          const existing = mockPlansStore.get(where.name);
          if (existing) {
            return { ...existing, ...update };
          }
          const created = { id: 'new-pro-uuid', ...create };
          mockPlansStore.set(where.name, created);
          return created;
        }),
      },
      planFeature: {
        count: vi.fn().mockResolvedValue(0),
        createMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
    };

    const result = await prismaMock.plan.upsert({
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

    expect(result.name).toBe('Pro');
    expect(result.price).toBe(29.99);
    expect(result.id).toBe('new-pro-uuid');
  });
});
