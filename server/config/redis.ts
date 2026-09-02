import { createClient } from 'redis';
import 'dotenv/config';

// Graceful fallback to localhost if REDIS_URL is not set
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient = createClient({
  url: REDIS_URL,
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
  // Important: We only log the error. The application handles fallbacks in the services.
});

redisClient.on('connect', () => {
  console.log(`Connected to Redis at ${REDIS_URL}`);
});

export const connectRedis = async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  } catch (err) {
    console.error('Failed to connect to Redis initially. Continuing without cache.', err);
  }
};
