import cron from 'node-cron';
import { AIRequest } from '../models/AIRequest.js';

export const initCleanupJob = () => {
  const RETENTION_DAYS = parseInt(process.env.AI_REQUEST_RETENTION_DAYS || '90', 10);
  
  // Schedule a daily job at midnight (0 0 * * *)
  cron.schedule('0 0 * * *', async () => {
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
};
