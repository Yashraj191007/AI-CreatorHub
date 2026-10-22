import cron from 'node-cron';
import { AIRequest } from '../models/AIRequest.js';
import { redisClient } from '../config/redis.js';

/**
 * Atomically acquires a distributed lock using Redis SET NX EX.
 * Returns the unique lock token if acquired, or null if already held.
 */
export const acquireDistributedLock = async (
  key: string,
  ttlSeconds = 3600
): Promise<string | null> => {
  if (!redisClient.isOpen) return null;
  const token =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `lock_${Date.now()}_${Math.random().toString(36).substring(2)}`;

  const result = await redisClient.set(key, token, {
    NX: true,
    EX: ttlSeconds,
  });

  return result ? token : null;
};

/**
 * Safely releases a distributed lock using an atomic Lua script.
 * Only deletes the key if the token matches, preventing accidental release of expired/re-acquired locks.
 */
export const releaseDistributedLock = async (
  key: string,
  token: string
): Promise<boolean> => {
  if (!redisClient.isOpen || !token) return false;

  const luaScript = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;

  if (typeof redisClient.eval === 'function') {
    const res = await redisClient.eval(luaScript, {
      keys: [key],
      arguments: [token],
    });
    return res === 1 || res === '1';
  } else if (typeof (redisClient as any).del === 'function') {
    await (redisClient as any).del(key);
    return true;
  }
  return false;
};

/**
 * Core cleanup execution logic with distributed locking and safe lock release.
 */
export const executeCleanup = async (): Promise<void> => {
  let lockToken: string | null = null;
  const RETENTION_DAYS = parseInt(process.env.AI_REQUEST_RETENTION_DAYS || '90', 10);

  // Distributed lock: Ensure only one instance executes cleanup across a multi-instance cluster
  if (redisClient.isOpen) {
    try {
      lockToken = await acquireDistributedLock('cron:lock:ai_cleanup', 3600);
      if (!lockToken) {
        console.log(
          '[Cron] Cleanup skipped: Another application instance holds the distributed execution lock.'
        );
        return;
      }
    } catch (lockErr) {
      console.error(
        '[Cron] Redis distributed lock acquisition error, skipping cleanup job to prevent concurrent execution:',
        lockErr
      );
      return;
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[Cron] Redis is disconnected in production. Skipping cleanup job to prevent uncoordinated concurrent runs.'
    );
    return;
  }

  console.log(`[Cron] Starting daily cleanup job for AIRequest (Retention: ${RETENTION_DAYS} days)...`);

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    const result = await AIRequest.deleteMany({
      createdAt: { $lt: cutoffDate },
    });

    console.log(`[Cron] Cleanup complete. Deleted ${result.deletedCount} old AIRequest records.`);
  } catch (error) {
    console.error('[Cron] Error running cleanup job:', error);
  } finally {
    if (lockToken && redisClient.isOpen) {
      try {
        await releaseDistributedLock('cron:lock:ai_cleanup', lockToken);
      } catch (releaseErr) {
        console.warn('[Cron] Error releasing distributed lock:', releaseErr);
      }
    }
  }
};

export const initCleanupJob = () => {
  // In production, require explicit ENABLE_CRON=true to prevent duplicate runs across instances
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_CRON !== 'true') {
    console.log(
      '[Cron] Cleanup job disabled by default in production. Set ENABLE_CRON=true on the designated worker instance.'
    );
    return null;
  }

  if (process.env.ENABLE_CRON === 'false') {
    console.log('[Cron] Cleanup job explicitly disabled on this instance (ENABLE_CRON=false).');
    return null;
  }

  const RETENTION_DAYS = parseInt(process.env.AI_REQUEST_RETENTION_DAYS || '90', 10);

  // Schedule a daily job at midnight (0 0 * * *)
  const task = cron.schedule(
    '0 0 * * *',
    executeCleanup,
    {
      timezone: 'UTC',
    }
  );

  console.log(`[Cron] Registered daily cleanup job (Retention: ${RETENTION_DAYS} days).`);
  return task;
};
