import cron from 'node-cron';
import { AIRequest } from '../models/AIRequest.js';
import { redisClient } from '../config/redis.js';

export const initCleanupJob = () => {
  // In production, require explicit ENABLE_CRON=true to prevent duplicate runs across instances
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_CRON !== 'true') {
    console.log('[Cron] Cleanup job disabled by default in production. Set ENABLE_CRON=true on the designated worker instance.');
    return null;
  }

  if (process.env.ENABLE_CRON === 'false') {
    console.log('[Cron] Cleanup job explicitly disabled on this instance (ENABLE_CRON=false).');
    return null;
  }

  const RETENTION_DAYS = parseInt(process.env.AI_REQUEST_RETENTION_DAYS || '90', 10);
  
  // Schedule a daily job at midnight (0 0 * * *)
  const task = cron.schedule('0 0 * * *', async () => {
    // Distributed lock: Ensure only one instance executes cleanup across a multi-instance cluster
    if (redisClient.isOpen) {
      try {
        const acquired = await redisClient.set('cron:lock:ai_cleanup', 'locked', {
          NX: true,
          EX: 3600, // 1 hour TTL prevents race conditions across instances
        });
        if (!acquired) {
          console.log('[Cron] Cleanup skipped: Another application instance holds the distributed execution lock.');
          return;
        }
      } catch (lockErr) {
        console.warn('[Cron] Redis distributed lock check failed, continuing with caution:', lockErr);
      }
    }

    console.log(`[Cron] Starting daily cleanup job for AIRequest (Retention: ${RETENTION_DAYS} days)...`);
    
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
      
      const result = await AIRequest.deleteMany({
        createdAt: { $lt: cutoffDate }
      });
      
      console.log(`[Cron] Cleanup complete. Deleted ${result.deletedCount} old AIRequest records.`);
    } catch (error) {
      console.error('[Cron] Error running cleanup job:', error);
      // We gracefully swallow the error so it doesn't crash the server.
    }
  }, {
    timezone: "UTC"
  });
  
  console.log(`[Cron] Registered daily cleanup job (Retention: ${RETENTION_DAYS} days).`);
  return task;
};
