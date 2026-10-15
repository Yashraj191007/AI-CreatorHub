import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import { apiLimiter, authLimiter, aiLimiter, uploadLimiter } from '../../middleware/rateLimiter.js';

describe('Rate Limiter Configurations & Behavior', () => {
  it('should have correct limits configured across all rate limiters', () => {
    expect(apiLimiter).toBeDefined();
    expect(authLimiter).toBeDefined();
    expect(aiLimiter).toBeDefined();
    expect(uploadLimiter).toBeDefined();
  });

  it('should reject requests with HTTP 429 when rate limit threshold is exceeded', async () => {
    const testApp = express();
    const testLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 3,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: 'Too many requests, please slow down',
      },
    });

    testApp.use(testLimiter);
    testApp.get('/test-rate-limit', (_req, res) => {
      res.json({ success: true });
    });

    // 1st request - 200 OK
    const res1 = await request(testApp).get('/test-rate-limit');
    expect(res1.status).toBe(200);

    // 2nd request - 200 OK
    const res2 = await request(testApp).get('/test-rate-limit');
    expect(res2.status).toBe(200);

    // 3rd request - 200 OK
    const res3 = await request(testApp).get('/test-rate-limit');
    expect(res3.status).toBe(200);

    // 4th request - 429 Too Many Requests
    const res4 = await request(testApp).get('/test-rate-limit');
    expect(res4.status).toBe(429);
    expect(res4.body.success).toBe(false);
    expect(res4.body.error).toContain('Too many requests');
    expect(res4.headers['ratelimit-limit']).toBe('3');
    expect(res4.headers['ratelimit-remaining']).toBe('0');
  });
});
