import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import http from 'http';
import { connectDB, closeDB, sanitizeMongoError } from '../../config/db.js';
import { startServer, handleStartupError } from '../../../server.js';
import * as seedModule from '../../utils/seed.js';
import * as cleanupModule from '../../jobs/cleanupJob.js';
import * as redisModule from '../../config/redis.js';

describe('MongoDB Fail-Closed Startup Tests', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('should redact credentials from MongoDB connection error strings', () => {
    const rawError = new Error(
      'failed to connect to mongodb+srv://admin_user:superSecretPassword123@cluster0.abcde.mongodb.net/prod?authSource=admin&token=secret_token_val'
    );
    const sanitized = sanitizeMongoError(rawError);

    expect(sanitized).not.toContain('admin_user');
    expect(sanitized).not.toContain('superSecretPassword123');
    expect(sanitized).not.toContain('secret_token_val');
    expect(sanitized).toContain('mongodb+srv://***:***@cluster0.abcde.mongodb.net/prod');
  });

  it('should fail-closed in production when MONGODB_URI is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.MONGODB_URI;

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(connectDB()).rejects.toThrow(
      /MONGODB_URI environment variable is required in production/
    );

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[FATAL] MONGODB_URI environment variable is required in production')
    );
  });

  it('should fail-closed in production when MONGODB_URI is empty whitespace', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MONGODB_URI = '   ';

    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(connectDB()).rejects.toThrow(
      /MONGODB_URI environment variable is required in production/
    );
  });

  it('should fail-closed and propagate sanitized error when production MongoDB connection fails', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MONGODB_URI = 'mongodb+srv://db_admin:leaked_pw_999@cluster0.test.net/prod_db';

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(mongoose, 'connect').mockRejectedValueOnce(
      new Error('connection closed by mongodb+srv://db_admin:leaked_pw_999@cluster0.test.net/prod_db')
    );

    await expect(connectDB()).rejects.toThrow(/Production MongoDB connection failed/);

    // Verify secrets are redacted from console.error output
    const loggedError = consoleErrorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(loggedError).not.toContain('leaked_pw_999');
    expect(loggedError).not.toContain('db_admin');
    expect(loggedError).toContain('cluster0.test.net/prod_db');
  });

  it('should successfully connect in production when valid MONGODB_URI is provided and connection succeeds', async () => {
    process.env.NODE_ENV = 'production';
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/prod_test_db';

    const connectSpy = vi.spyOn(mongoose, 'connect').mockResolvedValueOnce(mongoose as any);

    await expect(connectDB()).resolves.toBeUndefined();
    expect(connectSpy).toHaveBeenCalledWith('mongodb://127.0.0.1:27017/prod_test_db');
  });

  it('should fallback to MongoMemoryServer in development when local database is unavailable', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.MONGODB_URI;

    await connectDB();
    expect(mongoose.connection.readyState).toBe(1);

    await closeDB();
  });

  it('should prevent server from listening or running jobs when production database connection fails during startup', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.MONGODB_URI;

    const seedSpy = vi.spyOn(seedModule, 'seedInitialData').mockResolvedValue(undefined as any);
    const cronSpy = vi.spyOn(cleanupModule, 'initCleanupJob').mockImplementation((() => {}) as any);
    const redisSpy = vi.spyOn(redisModule, 'connectRedis').mockResolvedValue(undefined as any);
    const listenSpy = vi.spyOn(http.Server.prototype, 'listen');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(startServer()).rejects.toThrow(
      /MONGODB_URI environment variable is required in production/
    );

    expect(seedSpy).not.toHaveBeenCalled();
    expect(cronSpy).not.toHaveBeenCalled();
    expect(redisSpy).not.toHaveBeenCalled();
    expect(listenSpy).not.toHaveBeenCalled();
  });

  it('should exit process with code 1 in handleStartupError', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    handleStartupError(new Error('Fatal database connection error'));

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to start server:', expect.any(Error));
  });
});
