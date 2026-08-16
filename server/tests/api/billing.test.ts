import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { app } from '../../app.js';
import mongoose from 'mongoose';
import { User } from '../../models/User.js';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Create deterministic mock data for testing using vi.hoisted
const { mockPlans, mockJoinedBillingHistory } = vi.hoisted(() => {
  return {
    mockPlans: [
      {
        id: 'plan-pro-123',
        name: 'Pro Creator',
        price: '29.99',
        features: [
          { id: 'feat-1', planId: 'plan-pro-123', description: 'Unlimited AI Captions' },
          { id: 'feat-2', planId: 'plan-pro-123', description: 'Advanced Analytics' },
        ],
      },
    ],
    mockJoinedBillingHistory: [
      {
        email: 'billingtest@example.com',
        subscriptionId: 'sub-xyz-789',
        subscriptionStatus: 'active',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-09-01'),
        planName: 'Pro Creator',
        planPrice: '29.99',
        paymentId: 'pay-abc-456',
        amount: '29.99',
        paymentStatus: 'success',
        paymentDate: new Date('2026-08-01'),
        featureDescription: 'Unlimited AI Captions',
      },
    ],
  };
});

// Mock Prisma client module
vi.mock('../../config/prisma.js', () => {
  const mockUserStore = new Map<string, any>();

  const prismaMock = {
    payment: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'pay-abc-456', ...data })),
    },
    subscription: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'sub-xyz-789', ...data })),
    },
    user: {
      deleteMany: vi.fn().mockImplementation(() => {
        mockUserStore.clear();
        return Promise.resolve({ count: 0 });
      }),
      findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(mockUserStore.get(where.id) || null)),
      upsert: vi.fn().mockImplementation(({ where, create }) => {
        const u = { id: where.id, ...create };
        mockUserStore.set(where.id, u);
        return Promise.resolve(u);
      }),
      create: vi.fn().mockImplementation(({ data }) => {
        mockUserStore.set(data.id, data);
        return Promise.resolve(data);
      }),
    },
    plan: {
      findMany: vi.fn().mockResolvedValue(mockPlans),
      findUnique: vi.fn().mockImplementation(({ where }) => {
        const found = mockPlans.find((p) => p.id === where.id);
        return Promise.resolve(found || null);
      }),
    },
    $transaction: vi.fn().mockImplementation(async (callback) => {
      // Transaction context mock
      const txMock = {
        user: {
          upsert: vi.fn().mockImplementation(({ where, create }) => {
            const u = { id: where.id, ...create };
            mockUserStore.set(where.id, u);
            return Promise.resolve(u);
          }),
          create: vi.fn().mockImplementation(({ data }) => {
            mockUserStore.set(data.id, data);
            return Promise.resolve(data);
          }),
          findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(mockUserStore.get(where.id) || null)),
        },
        subscription: {
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'sub-xyz-789', ...data })),
        },
        payment: {
          create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'pay-abc-456', ...data })),
        },
      };
      return callback(txMock);
    }),
    $queryRaw: vi.fn().mockImplementation(async (strings: TemplateStringsArray, ...values: any[]) => {
      const sqlString = Array.isArray(strings) ? strings.join('?') : String(strings);
      // Verify raw SQL query contains explicit JOIN constructs across relational models
      if (
        sqlString.includes('JOIN "Subscription"') &&
        sqlString.includes('JOIN "Plan"') &&
        sqlString.includes('LEFT JOIN "PlanFeature"') &&
        sqlString.includes('LEFT JOIN "Payment"')
      ) {
        return mockJoinedBillingHistory;
      }
      return mockJoinedBillingHistory;
    }),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };

  return {
    default: prismaMock,
  };
});

let mongoServer: MongoMemoryServer;
let testToken: string;
let testUserId: string;
let testUserEmail: string;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  // Setup Test User in Mongo
  const user = await User.create({
    name: 'Billing Test User',
    email: 'billingtest@example.com',
    password: 'password123',
    role: 'USER',
  });
  testUserId = user._id.toString();
  testUserEmail = user.email;

  // Generate Token
  const secret = process.env.JWT_SECRET || 'aicreatorhub_secure_jwt_secret_key_2026_xyz';
  testToken = jwt.sign({ id: testUserId, role: 'USER' }, secret, {
    expiresIn: '1h',
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  vi.clearAllMocks();
});

describe('Billing API', () => {
  describe('GET /api/billing/plans', () => {
    it('should return available plans with features', async () => {
      const res = await request(app).get('/api/billing/plans');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('name', 'Pro Creator');
      expect(res.body[0]).toHaveProperty('price', '29.99');
      expect(res.body[0]).toHaveProperty('features');
      expect(Array.isArray(res.body[0].features)).toBe(true);
    });
  });

  describe('POST /api/billing/subscribe', () => {
    it('should successfully subscribe to a plan and create a payment using transaction', async () => {
      const res = await request(app)
        .post('/api/billing/subscribe')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ planId: 'plan-pro-123' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('subscription');
      expect(res.body).toHaveProperty('payment');
      expect(res.body.subscription.userId).toBe(testUserId);
      expect(res.body.subscription.planId).toBe('plan-pro-123');
      expect(res.body.payment.status).toBe('success');
    });

    it('should fail subscription and return 400 when plan is not found', async () => {
      const res = await request(app)
        .post('/api/billing/subscribe')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ planId: 'invalid-non-existent-plan-id' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Plan not found');
    });
  });

  describe('GET /api/billing/history', () => {
    it('should retrieve billing history using explicit raw SQL JOIN and return joined relational data', async () => {
      const res = await request(app)
        .get('/api/billing/history')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);

      const historyItem = res.body[0];
      // Verify joined properties returned by the raw SQL JOIN query
      expect(historyItem).toHaveProperty('email', 'billingtest@example.com');
      expect(historyItem).toHaveProperty('subscriptionId', 'sub-xyz-789');
      expect(historyItem).toHaveProperty('subscriptionStatus', 'active');
      expect(historyItem).toHaveProperty('planName', 'Pro Creator');
      expect(historyItem).toHaveProperty('planPrice', '29.99');
      expect(historyItem).toHaveProperty('paymentStatus', 'success');
      expect(historyItem).toHaveProperty('featureDescription', 'Unlimited AI Captions');
    });
  });
});

