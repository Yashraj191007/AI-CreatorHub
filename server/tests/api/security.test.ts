import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { app } from '../../app.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup.js';
import { User } from '../../models/User.js';
import { errorHandler } from '../../middleware/errorHandler.js';

const TEST_SECRET = process.env.JWT_SECRET || 'aicreatorhub_secure_jwt_secret_key_2026_xyz';

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

describe('Security & Authentication Hardening Tests', () => {
  it('should reject requests with an expired JWT token (401)', async () => {
    const user = await User.create({
      name: 'Expired User',
      email: 'expired@example.com',
      password: 'password123',
      role: 'USER',
    });

    // Create an expired token (expired 1 hour ago)
    const expiredToken = jwt.sign(
      { id: user._id.toString() },
      TEST_SECRET,
      { expiresIn: '-1h' }
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('token has expired');
  });

  it('should reject requests with a forged or invalid signature (401)', async () => {
    const user = await User.create({
      name: 'Tamper User',
      email: 'tamper@example.com',
      password: 'password123',
      role: 'USER',
    });

    // Token signed with incorrect secret key
    const forgedToken = jwt.sign(
      { id: user._id.toString() },
      'wrong_untrusted_secret_key_999'
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${forgedToken}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('invalid token signature or malformed token');
  });

  it('should reject requests missing Bearer prefix in authorization header (401)', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('token missing');
  });

  it('should prevent disabled user from logging into the platform (403)', async () => {
    await User.create({
      name: 'Disabled User',
      email: 'disabled@example.com',
      password: 'password123',
      role: 'USER',
      status: 'disabled',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'disabled@example.com',
        password: 'password123',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('disabled');
  });

  it('should block disabled user even if they hold a previously valid token (403)', async () => {
    const user = await User.create({
      name: 'Soon Disabled User',
      email: 'soondisabled@example.com',
      password: 'password123',
      role: 'USER',
      status: 'active',
    });

    const token = jwt.sign({ id: user._id.toString() }, TEST_SECRET, { expiresIn: '1h' });

    // Now administrator disables user
    user.status = 'disabled';
    await user.save();

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('disabled');
  });

  it('should enforce role-based access control blocking USER from ADMIN routes (403)', async () => {
    const regularUser = await User.create({
      name: 'Regular Role User',
      email: 'regrole@example.com',
      password: 'password123',
      role: 'USER',
    });

    const token = jwt.sign({ id: regularUser._id.toString() }, TEST_SECRET, { expiresIn: '1h' });

    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("User role 'USER' is not authorized");
  });

  it('should return 422 with field-level details on invalid request body schema', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'A', // too short
        email: 'not-an-email', // invalid email
        password: '123', // less than 6 chars
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.details).toBeDefined();
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('should mask 500 error messages and details in production environment to prevent secret leakage', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const mockReq = {} as any;
    let responseStatus = 0;
    let responseBody: any = null;
    const mockRes = {
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(body: any) {
        responseBody = body;
        return this;
      },
    } as any;

    const internalError = new Error('Sensitive PostgreSQL connection failed at 10.0.0.5:5432 with password my_secret_pw');
    errorHandler(internalError, mockReq, mockRes, () => {});

    expect(responseStatus).toBe(500);
    expect(responseBody.success).toBe(false);
    expect(responseBody.error).toBe('Internal Server Error');
    expect(responseBody.details).toBeNull();
    expect(responseBody.error).not.toContain('my_secret_pw');

    process.env.NODE_ENV = originalEnv;
  });

  it('should return process liveness at /api/health without exposing secrets', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.uptime).toBeDefined();
    expect(res.body.timestamp).toBeDefined();

    // Confirm no secrets or connection strings are leaked
    const jsonString = JSON.stringify(res.body);
    expect(jsonString).not.toContain('password');
    expect(jsonString).not.toContain('mongodb://');
    expect(jsonString).not.toContain('postgres://');
    expect(jsonString).not.toContain('secret');
  });

  it('should return service readiness status at /api/health/readiness without exposing credentials', async () => {
    const res = await request(app).get('/api/health/readiness');

    // Should return either 200 or 503 depending on Postgres connection availability in test environment
    expect([200, 503]).toContain(res.status);
    expect(res.body.services).toBeDefined();
    expect(res.body.services.mongodb).toBeDefined();
    expect(res.body.services.postgresql).toBeDefined();
    expect(res.body.services.redis).toBeDefined();

    // Zero secret leakage in response
    const jsonString = JSON.stringify(res.body);
    expect(jsonString).not.toContain('mongodb://');
    expect(jsonString).not.toContain('postgres://');
    expect(jsonString).not.toContain('redis://');
    expect(jsonString).not.toContain('password');
  });

  it('should return 404 JSON for unknown /api and /api/* routes instead of serving index.html', async () => {
    const res1 = await request(app).get('/api');
    expect(res1.status).toBe(404);
    expect(res1.body.success).toBe(false);
    expect(res1.body.error).toBe('API endpoint not found');

    const res2 = await request(app).get('/api/non-existent-endpoint');
    expect(res2.status).toBe(404);
    expect(res2.body.success).toBe(false);
    expect(res2.body.error).toBe('API endpoint not found');
  });

  it('should block public access to backend bundle files and sourcemaps', async () => {
    const res1 = await request(app).get('/server.cjs');
    expect(res1.status).toBe(404);
    expect(res1.body.success).toBe(false);
    expect(res1.body.error).toBe('Not found');

    const res2 = await request(app).get('/server.cjs.map');
    expect(res2.status).toBe(404);
    expect(res2.body.success).toBe(false);
    expect(res2.body.error).toBe('Not found');

    const res3 = await request(app).get('/dist/server.cjs');
    expect(res3.status).toBe(404);
    expect(res3.body.success).toBe(false);
  });
});
