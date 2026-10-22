import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { redisClient } from '../../config/redis';
import { getPlans } from '../../services/billingService';
import prisma from '../../config/prisma';
import cron from 'node-cron';
import { initCleanupJob } from '../../jobs/cleanupJob';
import { AIRequest } from '../../models/AIRequest';
import { initWebSocket, emitToUser } from '../../services/websocketService';
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// Mocks
vi.mock('../../config/redis', () => ({
  redisClient: {
    isOpen: true,
    get: vi.fn(),
    setEx: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    eval: vi.fn(),
    on: vi.fn(),
    connect: vi.fn(),
  },
  connectRedis: vi.fn(),
  sanitizeRedisError: (err: any) => (err instanceof Error ? err.message : String(err)),
  sanitizeRedisUrl: (url: string) => url,
}));

vi.mock('../../config/prisma', () => ({
  default: {
    plan: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(),
  },
}));

vi.mock('../../models/AIRequest', () => ({
  AIRequest: {
    deleteMany: vi.fn(),
  },
}));

vi.mock('socket.io', () => {
  const mockServer = {
    use: vi.fn(),
    on: vi.fn(),
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  };
  return {
    Server: vi.fn(function() { return mockServer; })
  };
});

describe('Batch 2: Redis, Cron, and WebSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (redisClient as any).isOpen = true;
    (redisClient.set as any).mockResolvedValue('OK');
  });

  describe('Redis Caching', () => {
    const mockPlans = [{ id: '1', name: 'Pro' }];

    it('should return cached data on cache hit', async () => {
      (redisClient.get as any).mockResolvedValue(JSON.stringify(mockPlans));

      const result = await getPlans();

      expect(redisClient.get).toHaveBeenCalledWith('billing:plans');
      expect(prisma.plan.findMany).not.toHaveBeenCalled();
      expect(result).toEqual(mockPlans);
    });

    it('should query Prisma and populate Redis on cache miss', async () => {
      (redisClient.get as any).mockResolvedValue(null);
      (prisma.plan.findMany as any).mockResolvedValue(mockPlans);

      const result = await getPlans();

      expect(redisClient.get).toHaveBeenCalledWith('billing:plans');
      expect(prisma.plan.findMany).toHaveBeenCalled();
      expect(redisClient.setEx).toHaveBeenCalledWith('billing:plans', 3600, JSON.stringify(mockPlans));
      expect(result).toEqual(mockPlans);
    });

    it('should gracefully fallback to Prisma if Redis get throws an error', async () => {
      (redisClient.get as any).mockRejectedValue(new Error('Redis connection lost'));
      (prisma.plan.findMany as any).mockResolvedValue(mockPlans);

      const result = await getPlans();

      expect(redisClient.get).toHaveBeenCalledWith('billing:plans');
      expect(prisma.plan.findMany).toHaveBeenCalled();
      expect(result).toEqual(mockPlans);
    });
  });

  describe('Cron Scheduled Job (Cleanup)', () => {
    it('should register the cleanup job successfully', () => {
      process.env.AI_REQUEST_RETENTION_DAYS = '90';
      initCleanupJob();

      expect(cron.schedule).toHaveBeenCalledWith('0 0 * * *', expect.any(Function), expect.objectContaining({ timezone: 'UTC' }));
    });

    it('should delete AIRequest records older than retention period', async () => {
      // Simulate running the cron callback
      process.env.AI_REQUEST_RETENTION_DAYS = '90';
      initCleanupJob();
      
      const cronCallback = (cron.schedule as any).mock.calls[0][1];
      
      const mockResult = { deletedCount: 50 };
      (AIRequest.deleteMany as any).mockResolvedValue(mockResult);

      await cronCallback();

      // Assert deleteMany was called with $lt filter
      expect(AIRequest.deleteMany).toHaveBeenCalled();
      const callArgs = (AIRequest.deleteMany as any).mock.calls[0][0];
      expect(callArgs).toHaveProperty('createdAt');
      expect(callArgs.createdAt).toHaveProperty('$lt');
      expect(callArgs.createdAt.$lt).toBeInstanceOf(Date);
    });

    it('should not register the cleanup job when ENABLE_CRON is false', () => {
      (cron.schedule as any).mockClear();
      process.env.ENABLE_CRON = 'false';
      const result = initCleanupJob();

      expect(result).toBeNull();
      expect(cron.schedule).not.toHaveBeenCalled();
      delete process.env.ENABLE_CRON;
    });

    it('should disable cron by default in production when ENABLE_CRON is not true', () => {
      (cron.schedule as any).mockClear();
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      delete process.env.ENABLE_CRON;

      const result = initCleanupJob();
      expect(result).toBeNull();
      expect(cron.schedule).not.toHaveBeenCalled();

      process.env.NODE_ENV = origEnv;
    });

    it('should enable cron in production when ENABLE_CRON is explicitly true', () => {
      (cron.schedule as any).mockClear();
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      process.env.ENABLE_CRON = 'true';

      const result = initCleanupJob();
      expect(result).not.toBeNull();
      expect(cron.schedule).toHaveBeenCalledWith('0 0 * * *', expect.any(Function), expect.any(Object));

      process.env.NODE_ENV = origEnv;
      delete process.env.ENABLE_CRON;
    });

    it('should skip cleanup execution if Redis distributed lock cannot be acquired', async () => {
      (cron.schedule as any).mockClear();
      (AIRequest.deleteMany as any).mockClear();

      // Mock redis client as open and failing to acquire lock (another instance holds lock)
      (redisClient as any).isOpen = true;
      (redisClient.set as any).mockResolvedValue(null);

      initCleanupJob();
      const cronCallback = (cron.schedule as any).mock.calls[0][1];
      await cronCallback();

      // Assert deleteMany was NOT called because lock was not acquired
      expect(AIRequest.deleteMany).not.toHaveBeenCalled();

      (redisClient as any).isOpen = false;
    });

    it('should acquire lock with TTL and safely release it via atomic Lua script after execution', async () => {
      (cron.schedule as any).mockClear();
      (AIRequest.deleteMany as any).mockClear();
      (redisClient.set as any).mockClear();
      (redisClient.eval as any).mockClear();

      (redisClient as any).isOpen = true;
      (redisClient.set as any).mockResolvedValue('OK');
      (redisClient.eval as any).mockResolvedValue(1);
      (AIRequest.deleteMany as any).mockResolvedValue({ deletedCount: 10 });

      initCleanupJob();
      const cronCallback = (cron.schedule as any).mock.calls[0][1];
      await cronCallback();

      expect(redisClient.set).toHaveBeenCalledWith(
        'cron:lock:ai_cleanup',
        expect.any(String),
        expect.objectContaining({ NX: true, EX: 3600 })
      );
      expect(AIRequest.deleteMany).toHaveBeenCalled();
      expect(redisClient.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("GET", KEYS[1]) == ARGV[1]'),
        expect.objectContaining({
          keys: ['cron:lock:ai_cleanup'],
          arguments: [expect.any(String)],
        })
      );
    });
  });

  describe('WebSocket Implementation', () => {
    it('should attach Socket.IO to HTTP server and register middleware', () => {
      process.env.JWT_SECRET = 'test_secret';
      const mockHttpServer = {} as HttpServer;
      initWebSocket(mockHttpServer);
      expect(SocketIOServer).toHaveBeenCalledWith(mockHttpServer, expect.any(Object));
    });

    it('should emit AI notification events to specific user rooms', () => {
      process.env.JWT_SECRET = 'test_secret';
      const mockHttpServer = {} as HttpServer;
      initWebSocket(mockHttpServer); // Sets up internal io instance

      const mockIoInstance = (SocketIOServer as any).mock.results[0].value;
      
      emitToUser('user123', 'ai_notification', { status: 'done' });
      
      expect(mockIoInstance.to).toHaveBeenCalledWith('user_user123');
      expect(mockIoInstance.emit).toHaveBeenCalledWith('ai_notification', { status: 'done' });
    });
  });
});
