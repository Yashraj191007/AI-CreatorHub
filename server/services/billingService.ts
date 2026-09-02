import prisma from '../config/prisma.js';
import { redisClient } from '../config/redis.js';

export const getPlans = async () => {
  const CACHE_KEY = 'billing:plans';
  
  // 1. Cache Lookup
  if (redisClient.isOpen) {
    try {
      const cached = await redisClient.get(CACHE_KEY);
      if (cached) {
        return JSON.parse(cached as string);
      }
    } catch (err) {
      console.error('Redis cache hit error:', err);
      // Gracefully fallback to Prisma on Redis error
    }
  }

  // 2. Cache Miss: Query Database
  const plans = await prisma.plan.findMany({
    include: {
      features: true,
    },
  });
  
  // 3. Populate Cache
  if (redisClient.isOpen) {
    try {
      await redisClient.setEx(CACHE_KEY, 3600, JSON.stringify(plans)); // 1 hour TTL
    } catch (err) {
      console.error('Redis cache set error:', err);
    }
  }
  
  return plans;
};

export const getBillingHistory = async (userId: string) => {
  // Use Prisma's native methods for normal operations where possible, 
  // but explicitly demonstrate a raw SQL JOIN for the history requirement.
  
  // The requirement: "Keep the Prisma relational query capability, but ALSO implement one explicit SQL JOIN query through Prisma $queryRaw for the billing-history use case."
  // So we fetch the history using $queryRaw to demonstrate explicit JOINs:
  // User -> Subscription -> Plan -> PlanFeature -> Payment
  
  const historyRaw: any[] = await prisma.$queryRaw`
    SELECT 
      u.email,
      s.id AS "subscriptionId",
      s.status AS "subscriptionStatus",
      s."startDate",
      s."endDate",
      p.name AS "planName",
      p.price AS "planPrice",
      pay.id AS "paymentId",
      pay.amount,
      pay.status AS "paymentStatus",
      pay."paymentDate",
      pf.description AS "featureDescription"
    FROM "User" u
    JOIN "Subscription" s ON u.id = s."userId"
    JOIN "Plan" p ON s."planId" = p.id
    LEFT JOIN "PlanFeature" pf ON p.id = pf."planId"
    LEFT JOIN "Payment" pay ON s.id = pay."subscriptionId"
    WHERE u.id = ${userId}
    ORDER BY pay."paymentDate" DESC, pf.description ASC
  `;

  // We could also do it with Prisma relational queries to satisfy both, but the requirement specifically requested doing the history via $queryRaw for the viva demonstration. 
  // We will return the raw result directly (it returns an array of joined rows).
  return historyRaw;
};

export const subscribeToPlan = async (userId: string, email: string, planId: string) => {
  // Validate plan exists
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) {
    throw new Error('Plan not found');
  }

  // Calculate dates
  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1); // 1 month subscription

  // Perform transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Sync user lazily
    const user = await tx.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email },
    });

    // 2. Create the subscription
    const subscription = await tx.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        status: 'active',
        startDate,
        endDate,
      },
    });

    // 3. Create successful payment record
    const payment = await tx.payment.create({
      data: {
        subscriptionId: subscription.id,
        amount: plan.price,
        status: 'success',
      },
    });

    return { subscription, payment };
  });

  return result;
};
