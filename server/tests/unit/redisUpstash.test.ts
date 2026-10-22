import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  connectRedis,
  closeRedis,
  sanitizeRedisUrl,
  sanitizeRedisError,
  validateRedisUrl,
  resolveRedisUrl,
  getRedisClientOptions,
  createRedisClient,
  redisClient,
  setRedisClient,
  resetRedisClient,
  setClientFactory,
} from '../../config/redis.js';
import {
  acquireDistributedLock,
  releaseDistributedLock,
  executeCleanup,
} from '../../jobs/cleanupJob.js';
import {
  storeExchangeCode,
  consumeExchangeCode,
  markStateNonceConsumed,
  clearMemoryOAuthStore,
} from '../../services/oauthStore.js';
import { getPlans } from '../../services/billingService.js';
import prisma from '../../config/prisma.js';
import { AIRequest } from '../../models/AIRequest.js';
import mongoose from 'mongoose';
import http from 'http';
import { startServer } from '../../../server.js';
import * as seedModule from '../../utils/seed.js';
import * as cleanupModule from '../../jobs/cleanupJob.js';

describe('Upstash Redis Configuration & Production Integration Tests', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    clearMemoryOAuthStore();
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    clearMemoryOAuthStore();
    setClientFactory((url) => createRedisClient(url));
    resetRedisClient();
  });

  describe('Credential Sanitization & Secret Leakage Prevention', () => {
    it('should redact username, password, and tokens from TLS connection URLs', () => {
      const rawUpstashUrl =
        'rediss://default:AbCdEf1234567890@ap-south-1-12345.upstash.io:6379';
      const sanitized = sanitizeRedisUrl(rawUpstashUrl);

      expect(sanitized).not.toContain('AbCdEf1234567890');
      expect(sanitized).toContain('rediss://***:***@ap-south-1-12345.upstash.io:6379');
    });

    it('should redact sensitive query parameters from connection URLs', () => {
      const rawUrlWithParams =
        'redis://:topSecretPwd@localhost:6379?password=superSecret123&token=myToken99';
      const sanitized = sanitizeRedisUrl(rawUrlWithParams);

      expect(sanitized).not.toContain('topSecretPwd');
      expect(sanitized).not.toContain('superSecret123');
      expect(sanitized).not.toContain('myToken99');
    });

    it('should preserve safe URLs without credentials', () => {
      expect(sanitizeRedisUrl('redis://localhost:6379')).toBe('redis://localhost:6379');
      expect(sanitizeRedisUrl('')).toBe('');
    });

    it('should redact credentials from Redis error messages', () => {
      const rawError = new Error(
        'Failed to connect to rediss://default:superSecretToken99@aws-mumbai.upstash.io:6379: connection timed out'
      );
      const sanitized = sanitizeRedisError(rawError);

      expect(sanitized).not.toContain('superSecretToken99');
      expect(sanitized).toContain('rediss://***:***@aws-mumbai.upstash.io:6379');
    });
  });

  describe('URL Scheme Validation & Upstash TLS Compatibility', () => {
    it('should validate standard TLS-enabled Upstash URLs (rediss://)', () => {
      const upstashUrl =
        'rediss://default:mumbaiToken@upstash-mumbai.upstash.io:6379';
      expect(validateRedisUrl(upstashUrl)).toBe(true);
    });

    it('should validate standard local Redis URLs (redis://)', () => {
      expect(validateRedisUrl('redis://127.0.0.1:6379')).toBe(true);
    });

    it('should reject non-Redis protocols (e.g. http://, postgres://, ftp://)', () => {
      expect(() => validateRedisUrl('http://upstash-mumbai.upstash.io:6379')).toThrow(
        /Invalid Redis URL protocol "http:". Expected "redis:" or "rediss:"/
      );
      expect(() => validateRedisUrl('postgres://user:pass@localhost:5432/db')).toThrow(
        /Invalid Redis URL protocol/
      );
    });

    it('should reject empty or malformed URLs', () => {
      expect(() => validateRedisUrl('')).toThrow(/Redis URL is empty/);
      expect(() => validateRedisUrl('   ')).toThrow(/Redis URL is empty/);
      expect(() => validateRedisUrl('not-a-url')).toThrow(/malformed connection string/);
    });

    it('should configure node-redis client options with Upstash TLS enabled', () => {
      const upstashUrl =
        'rediss://default:dummyPass@mumbai-dummy.upstash.io:6379';
      const client = createRedisClient(upstashUrl);
      const clientOptions = (client as any).options;

      expect(clientOptions.socket.tls).toBe(true);
      expect(clientOptions.socket.host).toBe('mumbai-dummy.upstash.io');
      expect(clientOptions.socket.port).toBe(6379);
      expect(clientOptions.socket.connectTimeout).toBe(5000);
    });
  });

  describe('Production Startup & Fail-Closed Behavior', () => {
    it('should fail-closed in production when REDIS_URL is missing', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.REDIS_URL;

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(connectRedis()).rejects.toThrow(
        /REDIS_URL environment variable is required in production/
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[FATAL] REDIS_URL environment variable is required in production')
      );
    });

    it('should fail-closed in production when REDIS_URL is empty whitespace', async () => {
      process.env.NODE_ENV = 'production';
      process.env.REDIS_URL = '    ';

      vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(connectRedis()).rejects.toThrow(
        /REDIS_URL environment variable is required in production/
      );
    });

    it('should strictly require REDIS_URL in resolveRedisUrl when in production and never return localhost', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.REDIS_URL;

      expect(() => resolveRedisUrl()).toThrow(
        /REDIS_URL environment variable is required in production/
      );
    });

    it('should reject invalid protocols in resolveRedisUrl in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.REDIS_URL = 'http://upstash-mumbai.upstash.io:6379';

      expect(() => resolveRedisUrl()).toThrow(/Invalid Redis URL protocol/);
    });

    it('should fall back to localhost:6379 in resolveRedisUrl only in non-production environments', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.REDIS_URL;
      expect(resolveRedisUrl()).toBe('redis://localhost:6379');

      process.env.NODE_ENV = 'test';
      delete process.env.REDIS_URL;
      expect(resolveRedisUrl()).toBe('redis://localhost:6379');
    });

    it('should synchronize redisClient options to targetUrl when REDIS_URL changes after import', async () => {
      process.env.NODE_ENV = 'production';
      const dynamicUrl = 'rediss://default:dynamicPass@upstash-dynamo.upstash.io:6379';
      process.env.REDIS_URL = dynamicUrl;

      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(false);
      vi.spyOn(redisClient, 'connect').mockResolvedValue(undefined as any);

      await connectRedis();

      expect((redisClient as any)?.options?.url).toBe(dynamicUrl);
    });

    it('should fail-closed and propagate sanitized error when production Redis connection fails', async () => {
      process.env.NODE_ENV = 'production';
      process.env.REDIS_URL =
        'rediss://default:superSecretPass@upstash-mumbai.upstash.io:6379';

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(false);
      vi.spyOn(redisClient, 'connect').mockRejectedValueOnce(
        new Error(
          'getaddrinfo ENOTFOUND rediss://default:superSecretPass@upstash-mumbai.upstash.io:6379'
        )
      );

      await expect(connectRedis()).rejects.toThrow(/Production Redis connection failed/);

      // Verify no secrets in logged errors
      const loggedError = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
      expect(loggedError).not.toContain('superSecretPass');
      expect(loggedError).toContain('rediss://***:***@upstash-mumbai.upstash.io:6379');
    });

    it('should successfully connect in production when valid REDIS_URL is provided', async () => {
      process.env.NODE_ENV = 'production';
      process.env.REDIS_URL =
        'rediss://default:validPass@upstash-mumbai.upstash.io:6379';

      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(false);
      const connectSpy = vi.spyOn(redisClient, 'connect').mockResolvedValueOnce(undefined as any);

      await expect(connectRedis()).resolves.toBeUndefined();
      expect(connectSpy).toHaveBeenCalled();
    });

    it('should gracefully fallback in development when local Redis is unavailable', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.REDIS_URL;

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(false);
      vi.spyOn(redisClient, 'connect').mockRejectedValueOnce(new Error('ECONNREFUSED 127.0.0.1:6379'));

      // Should NOT throw in development
      await expect(connectRedis()).resolves.toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Redis is not running locally. Continuing without cache')
      );
    });

    it('should prevent server from listening or running jobs when production Redis connection fails during startup', async () => {
      process.env.NODE_ENV = 'production';
      process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/prod_test';
      delete process.env.REDIS_URL;

      vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose as any);
      vi.spyOn(seedModule, 'seedInitialData').mockResolvedValue(undefined as any);
      const cronSpy = vi.spyOn(cleanupModule, 'initCleanupJob').mockImplementation((() => {}) as any);
      const listenSpy = vi.spyOn(http.Server.prototype, 'listen');
      vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(startServer()).rejects.toThrow(
        /REDIS_URL environment variable is required in production/
      );

      expect(cronSpy).not.toHaveBeenCalled();
      expect(listenSpy).not.toHaveBeenCalled();
    });

    it('should not report success and fail startup when existing open client is connected to a stale URL and target connection fails', async () => {
      process.env.NODE_ENV = 'production';
      process.env.REDIS_URL = 'rediss://default:secret@upstash-mumbai.upstash.io:6379';

      const staleClient = {
        isOpen: true,
        options: { url: 'redis://stale-old-cluster:6379' },
        quit: vi.fn().mockResolvedValue('OK'),
        disconnect: vi.fn(),
      };
      setRedisClient(staleClient);

      const targetClient = {
        isOpen: false,
        options: { url: process.env.REDIS_URL },
        connect: vi.fn().mockRejectedValue(new Error('Connection refused to Upstash')),
      };
      setClientFactory(() => targetClient);

      vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(connectRedis()).rejects.toThrow(
        /Production Redis connection failed/
      );

      // In-flight requests on stale client are not prematurely broken
      expect(staleClient.quit).not.toHaveBeenCalled();
      expect(staleClient.disconnect).not.toHaveBeenCalled();
      // Client reference was not swapped to the failed client
      expect(redisClient).toBe(staleClient);
    });

    it('should safely transition from open stale client to targetUrl by connecting new client first and draining stale client with quit', async () => {
      process.env.NODE_ENV = 'production';
      process.env.REDIS_URL = 'rediss://default:secret@upstash-mumbai.upstash.io:6379';

      const staleClient = {
        isOpen: true,
        options: { url: 'redis://stale-old-cluster:6379' },
        quit: vi.fn().mockResolvedValue('OK'),
        disconnect: vi.fn(),
      };
      setRedisClient(staleClient);

      const targetClient = {
        isOpen: true,
        options: { url: process.env.REDIS_URL },
        connect: vi.fn().mockResolvedValue(undefined),
      };
      setClientFactory(() => targetClient);

      await expect(connectRedis()).resolves.toBeUndefined();

      // Verified: new client connected first, active reference updated, stale client safely drained
      expect(targetClient.connect).toHaveBeenCalled();
      expect(redisClient).toBe(targetClient);
      expect(staleClient.quit).toHaveBeenCalled();
      expect(staleClient.disconnect).not.toHaveBeenCalled();
    });

    it('should return immediately without reconnecting when open client is already connected to targetUrl', async () => {
      process.env.NODE_ENV = 'production';
      process.env.REDIS_URL = 'rediss://default:secret@upstash-mumbai.upstash.io:6379';

      const alreadyConnectedClient = {
        isOpen: true,
        options: { url: process.env.REDIS_URL },
        connect: vi.fn(),
        quit: vi.fn(),
      };
      setRedisClient(alreadyConnectedClient);

      const factorySpy = vi.fn();
      setClientFactory(factorySpy);

      await expect(connectRedis()).resolves.toBeUndefined();

      expect(factorySpy).not.toHaveBeenCalled();
      expect(alreadyConnectedClient.connect).not.toHaveBeenCalled();
      expect(alreadyConnectedClient.quit).not.toHaveBeenCalled();
    });

    it('should gracefully close the active Redis client on closeRedis() when open', async () => {
      const activeClient = {
        isOpen: true,
        quit: vi.fn().mockResolvedValue('OK'),
      };
      setRedisClient(activeClient);

      await closeRedis();

      expect(activeClient.quit).toHaveBeenCalled();
    });

    it('should not throw if closeRedis() encounters an error during shutdown', async () => {
      const activeClient = {
        isOpen: true,
        quit: vi.fn().mockRejectedValue(new Error('Socket closed unexpectedly')),
      };
      setRedisClient(activeClient);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(closeRedis()).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        'Error during Redis client shutdown:',
        expect.stringContaining('Socket closed unexpectedly')
      );
    });
  });

  describe('Reconnect Strategy Behavior', () => {
    it('should enforce exponential backoff up to 3000ms and max 10 retries in production', () => {
      process.env.NODE_ENV = 'production';
      const options = getRedisClientOptions('rediss://upstash:6379');
      const strategy = options.socket.reconnectStrategy;

      expect(strategy(1)).toBe(100);
      expect(strategy(5)).toBe(500);
      expect(strategy(10)).toBe(1000);
      expect(strategy(11)).toBeInstanceOf(Error);
    });

    it('should fail fast on 1st retry in development mode', () => {
      process.env.NODE_ENV = 'development';
      const options = getRedisClientOptions('redis://localhost:6379');
      const strategy = options.socket.reconnectStrategy;

      expect(strategy(1)).toBe(false);
    });
  });

  describe('OAuth Single-Use Exchange Code & Nonce Security', () => {
    const mockPayload = { token: 'jwt_test_token', user: { id: 'u1', email: 'test@example.com' } };

    it('should store and consume exchange code atomically via Redis Lua script', async () => {
      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(true);
      const setExSpy = vi.spyOn(redisClient, 'setEx').mockResolvedValue('OK' as any);
      const evalSpy = vi.spyOn(redisClient, 'eval').mockResolvedValue(JSON.stringify(mockPayload));

      await storeExchangeCode('code_123', mockPayload, 60);
      expect(setExSpy).toHaveBeenCalledWith('oauth:exchange:code_123', 60, JSON.stringify(mockPayload));

      const consumed = await consumeExchangeCode('code_123');
      expect(consumed).toEqual(mockPayload);
      expect(evalSpy).toHaveBeenCalledWith(
        expect.stringContaining("redis.call('DEL', KEYS[1])"),
        expect.objectContaining({ keys: ['oauth:exchange:code_123'] })
      );
    });

    it('should prevent replay attack by returning null when code has already been consumed', async () => {
      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(true);
      // Redis eval returns null (already deleted by atomic Lua)
      vi.spyOn(redisClient, 'eval').mockResolvedValue(null);

      const consumed = await consumeExchangeCode('code_already_consumed');
      expect(consumed).toBeNull();
    });

    it('should fail-closed in production if Redis is disconnected during code storage', async () => {
      process.env.NODE_ENV = 'production';
      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(false);

      await expect(storeExchangeCode('code_fail', mockPayload)).rejects.toThrow(
        /Redis shared store is unavailable/
      );
    });

    it('should fail-closed in production if Redis is disconnected during code consumption', async () => {
      process.env.NODE_ENV = 'production';
      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(false);

      await expect(consumeExchangeCode('code_fail')).rejects.toThrow(
        /Redis shared store is unavailable/
      );
    });

    it('should atomically mark OAuth state nonce as consumed and detect replays', async () => {
      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(true);
      const setSpy = vi.spyOn(redisClient, 'set');

      // First call: Fresh nonce -> OK
      setSpy.mockResolvedValueOnce('OK' as any);
      const firstCheck = await markStateNonceConsumed('nonce_abc', 600);
      expect(firstCheck).toBe(true);
      expect(setSpy).toHaveBeenCalledWith('oauth:state:nonce:nonce_abc', '1', {
        NX: true,
        EX: 600,
      });

      // Second call: Replayed nonce -> null (already exists)
      setSpy.mockResolvedValueOnce(null as any);
      const secondCheck = await markStateNonceConsumed('nonce_abc', 600);
      expect(secondCheck).toBe(false);
    });

    it('should fallback to in-memory store in non-production environments when Redis is offline', async () => {
      process.env.NODE_ENV = 'development';
      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(false);

      await storeExchangeCode('dev_code_1', mockPayload, 10);
      const firstRead = await consumeExchangeCode('dev_code_1');
      expect(firstRead).toEqual(mockPayload);

      // Single-use: Second read must return null
      const secondRead = await consumeExchangeCode('dev_code_1');
      expect(secondRead).toBeNull();
    });
  });

  describe('Distributed Cron Lock Acquisition & Safe Lua Release', () => {
    it('should atomically acquire distributed lock with unique token and TTL', async () => {
      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(true);
      const setSpy = vi.spyOn(redisClient, 'set').mockResolvedValue('OK' as any);

      const token = await acquireDistributedLock('cron:lock:ai_cleanup', 3600);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(setSpy).toHaveBeenCalledWith('cron:lock:ai_cleanup', token, {
        NX: true,
        EX: 3600,
      });
    });

    it('should return null when another instance holds the lock', async () => {
      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(true);
      vi.spyOn(redisClient, 'set').mockResolvedValue(null as any);

      const token = await acquireDistributedLock('cron:lock:ai_cleanup', 3600);
      expect(token).toBeNull();
    });

    it('should safely release lock only if the token matches via atomic Lua script', async () => {
      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(true);
      const evalSpy = vi.spyOn(redisClient, 'eval').mockResolvedValue(1 as any);

      const released = await releaseDistributedLock('cron:lock:ai_cleanup', 'my_lock_token');
      expect(released).toBe(true);
      expect(evalSpy).toHaveBeenCalledWith(
        expect.stringContaining('if redis.call("GET", KEYS[1]) == ARGV[1] then'),
        expect.objectContaining({
          keys: ['cron:lock:ai_cleanup'],
          arguments: ['my_lock_token'],
        })
      );
    });

    it('should refuse to release lock if token does not match (e.g. lock expired and re-acquired)', async () => {
      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(true);
      vi.spyOn(redisClient, 'eval').mockResolvedValue(0 as any);

      const released = await releaseDistributedLock('cron:lock:ai_cleanup', 'expired_token');
      expect(released).toBe(false);
    });

    it('should abort cleanup execution if lock acquisition throws an error', async () => {
      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(true);
      vi.spyOn(redisClient, 'set').mockRejectedValue(new Error('Redis connection reset'));
      const deleteSpy = vi.spyOn(AIRequest, 'deleteMany');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await executeCleanup();

      // Must NOT run cleanup if lock throws error
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Redis distributed lock acquisition error'),
        expect.any(Error)
      );
    });
  });

  describe('Optional Redis Cache-Aside Functionality (Billing Plans)', () => {
    const mockPlans = [
      { id: 'p1', name: 'Creator Free', price: 0 },
      { id: 'p2', name: 'Creator Pro', price: 29 },
    ];

    it('should return cached plans without querying database on cache hit', async () => {
      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(true);
      vi.spyOn(redisClient, 'get').mockResolvedValue(JSON.stringify(mockPlans));
      const prismaSpy = vi.spyOn(prisma.plan, 'findMany');

      const result = await getPlans();
      expect(result).toEqual(mockPlans);
      expect(prismaSpy).not.toHaveBeenCalled();
    });

    it('should query Prisma database and populate Redis with TTL on cache miss', async () => {
      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(true);
      vi.spyOn(redisClient, 'get').mockResolvedValue(null);
      const prismaSpy = vi.spyOn(prisma.plan, 'findMany').mockResolvedValue(mockPlans as any);
      const setExSpy = vi.spyOn(redisClient, 'setEx').mockResolvedValue('OK' as any);

      const result = await getPlans();
      expect(result).toEqual(mockPlans);
      expect(prismaSpy).toHaveBeenCalled();
      expect(setExSpy).toHaveBeenCalledWith('billing:plans', 3600, JSON.stringify(mockPlans));
    });

    it('should gracefully fallback to Prisma database when Redis throws error', async () => {
      vi.spyOn(redisClient, 'isOpen', 'get').mockReturnValue(true);
      vi.spyOn(redisClient, 'get').mockRejectedValue(new Error('Redis read timeout'));
      const prismaSpy = vi.spyOn(prisma.plan, 'findMany').mockResolvedValue(mockPlans as any);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await getPlans();
      expect(result).toEqual(mockPlans);
      expect(prismaSpy).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Redis cache hit error:',
        expect.stringContaining('Redis read timeout')
      );
    });
  });
});
