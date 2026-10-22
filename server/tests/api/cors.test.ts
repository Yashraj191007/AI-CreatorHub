import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app, getAllowedOrigins } from '../../app.js';

describe('CORS Trusted Origins Hardening Tests', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should allow requests from a configured APP_URL origin with credentials', async () => {
    process.env.APP_URL = 'https://creatorhub.example.com';

    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://creatorhub.example.com');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://creatorhub.example.com');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('should reject untrusted origins by omitting Access-Control-Allow-Origin', async () => {
    process.env.APP_URL = 'https://creatorhub.example.com';

    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://malicious-attacker.com');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('should allow requests without an Origin header (server-to-server and health checks)', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('should respond to preflight OPTIONS requests from an allowed origin with credentials and methods', async () => {
    process.env.APP_URL = 'https://creatorhub.example.com';

    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'https://creatorhub.example.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://creatorhub.example.com');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  it('should reject preflight OPTIONS requests from an untrusted origin', async () => {
    process.env.APP_URL = 'https://creatorhub.example.com';

    const res = await request(app)
      .options('/api/health')
      .set('Origin', 'https://evil.org')
      .set('Access-Control-Request-Method', 'POST');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('should support multiple allowed origins via APP_URL and CORS_ALLOWED_ORIGINS', async () => {
    process.env.APP_URL = 'https://primary-app.example.com';
    process.env.CORS_ALLOWED_ORIGINS = 'https://admin.example.com, https://partner.example.com';

    const allowed = getAllowedOrigins();
    expect(allowed).toContain('https://primary-app.example.com');
    expect(allowed).toContain('https://admin.example.com');
    expect(allowed).toContain('https://partner.example.com');

    // Test primary origin
    const res1 = await request(app)
      .get('/api/health')
      .set('Origin', 'https://primary-app.example.com');
    expect(res1.headers['access-control-allow-origin']).toBe('https://primary-app.example.com');

    // Test second origin from CORS_ALLOWED_ORIGINS
    const res2 = await request(app)
      .get('/api/health')
      .set('Origin', 'https://admin.example.com');
    expect(res2.headers['access-control-allow-origin']).toBe('https://admin.example.com');

    // Test third origin from CORS_ALLOWED_ORIGINS
    const res3 = await request(app)
      .get('/api/health')
      .set('Origin', 'https://partner.example.com');
    expect(res3.headers['access-control-allow-origin']).toBe('https://partner.example.com');

    // Test untrusted origin
    const resEvil = await request(app)
      .get('/api/health')
      .set('Origin', 'https://untrusted.com');
    expect(resEvil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('should normalize origins by stripping trailing slashes', async () => {
    process.env.APP_URL = 'https://creatorhub.example.com/';

    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://creatorhub.example.com');

    expect(res.headers['access-control-allow-origin']).toBe('https://creatorhub.example.com');
  });

  it('should strictly restrict origins in production mode without adding local dev origins', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'https://production-app.onrender.com';
    delete process.env.CORS_ALLOWED_ORIGINS;

    const allowed = getAllowedOrigins();
    expect(allowed).toEqual(['https://production-app.onrender.com']);
    expect(allowed).not.toContain('http://localhost:5173');
    expect(allowed).not.toContain('http://localhost:3000');
  });

  describe('Production Fail-Closed & Readiness Reporting', () => {
    it('should fail-closed with empty allowlist in production when no origins are configured', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.APP_URL;
      delete process.env.CORS_ALLOWED_ORIGINS;

      const allowed = getAllowedOrigins();
      expect(allowed).toEqual([]);
      expect(allowed).not.toContain('http://localhost:5000');

      // Untrusted and localhost cross-origin requests must be rejected
      const resLocal = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:5000');
      expect(resLocal.headers['access-control-allow-origin']).toBeUndefined();

      const resUntrusted = await request(app)
        .get('/api/health')
        .set('Origin', 'https://untrusted.com');
      expect(resUntrusted.headers['access-control-allow-origin']).toBeUndefined();

      // Requests without Origin header (health checks, monitoring) are still accepted
      const resNoOrigin = await request(app).get('/api/health');
      expect(resNoOrigin.status).toBe(200);

      // Readiness probe must report configuration failure (503 and missing_allowed_origins)
      const resReadiness = await request(app).get('/api/health/readiness');
      expect(resReadiness.status).toBe(503);
      expect(resReadiness.body.status).toBe('unhealthy');
      expect(resReadiness.body.services.cors).toBe('missing_allowed_origins');
    });

    it('should report cors as configured in readiness probe when production APP_URL is set', async () => {
      process.env.NODE_ENV = 'production';
      process.env.APP_URL = 'https://production-app.onrender.com';
      delete process.env.CORS_ALLOWED_ORIGINS;

      // Cross-origin request from configured APP_URL succeeds
      const resApp = await request(app)
        .get('/api/health')
        .set('Origin', 'https://production-app.onrender.com');
      expect(resApp.headers['access-control-allow-origin']).toBe('https://production-app.onrender.com');

      // Cross-origin request from untrusted origin is rejected
      const resEvil = await request(app)
        .get('/api/health')
        .set('Origin', 'https://malicious-site.com');
      expect(resEvil.headers['access-control-allow-origin']).toBeUndefined();

      // Readiness probe reports cors as configured
      const resReadiness = await request(app).get('/api/health/readiness');
      expect(resReadiness.body.services.cors).toBe('configured');
    });

    it('should support normal Vercel URLs with or without scheme and trailing slashes', () => {
      process.env.NODE_ENV = 'production';
      process.env.APP_URL = 'ai-creatorhub.vercel.app';
      process.env.CORS_ALLOWED_ORIGINS = 'https://ai-creatorhub-preview-1.vercel.app/, https://ai-creatorhub-preview-2.vercel.app';

      const allowed = getAllowedOrigins();
      expect(allowed).toContain('https://ai-creatorhub.vercel.app');
      expect(allowed).toContain('https://ai-creatorhub-preview-1.vercel.app');
      expect(allowed).toContain('https://ai-creatorhub-preview-2.vercel.app');
      expect(allowed).not.toContain('https://ai-creatorhub-preview-1.vercel.app/');
    });

    it('should discard malformed production origins and fail-closed', async () => {
      process.env.NODE_ENV = 'production';
      process.env.APP_URL = 'not-a-valid-origin with spaces';
      process.env.CORS_ALLOWED_ORIGINS = '*, null, http://, javascript:alert(1), file:///etc/passwd';

      const allowed = getAllowedOrigins();
      expect(allowed).toEqual([]);

      // Rejected
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'not-a-valid-origin with spaces');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();

      // Readiness reports configuration error
      const resReadiness = await request(app).get('/api/health/readiness');
      expect(resReadiness.status).toBe(503);
      expect(resReadiness.body.services.cors).toBe('missing_allowed_origins');
    });

    it('should preserve localhost origins for development and test environments', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.APP_URL;
      delete process.env.CORS_ALLOWED_ORIGINS;

      const allowed = getAllowedOrigins();
      expect(allowed).toContain('http://localhost:5173');
      expect(allowed).toContain('http://localhost:5000');
      expect(allowed).toContain('http://127.0.0.1:5173');

      // Development localhost cross-origin request succeeds
      const resDev = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:5173');
      expect(resDev.headers['access-control-allow-origin']).toBe('http://localhost:5173');

      // Untrusted external origin still rejected
      const resEvil = await request(app)
        .get('/api/health')
        .set('Origin', 'https://untrusted-dev.com');
      expect(resEvil.headers['access-control-allow-origin']).toBeUndefined();

      // Readiness probe in development reports cors as configured
      const resReadiness = await request(app).get('/api/health/readiness');
      expect(resReadiness.body.services.cors).toBe('configured');
    });
  });
});
