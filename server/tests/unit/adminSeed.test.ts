import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup.js';
import { User } from '../../models/User.js';
import { seedInitialData } from '../../utils/seed.js';

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  delete process.env.INITIAL_ADMIN_EMAIL;
  delete process.env.INITIAL_ADMIN_PASSWORD;
  delete process.env.INITIAL_ADMIN_NAME;
});

describe('Production Administrator Seeding & Security Tests', () => {
  it('should NOT create predictable demo credentials in production if INITIAL_ADMIN_* are not set', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      await seedInitialData();

      // Verify no users exist (no predictable admin@aicreatorhub.com or creator@aicreatorhub.com)
      const userCount = await User.countDocuments();
      expect(userCount).toBe(0);

      const demoAdmin = await User.findOne({ email: 'admin@aicreatorhub.com' });
      expect(demoAdmin).toBeNull();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('should provision initial admin in production when INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are provided', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.INITIAL_ADMIN_EMAIL = 'superadmin@example.com';
    process.env.INITIAL_ADMIN_PASSWORD = 'super_secure_admin_password_2026';
    process.env.INITIAL_ADMIN_NAME = 'Primary SysAdmin';

    try {
      await seedInitialData();

      const admin = await User.findOne({ email: 'superadmin@example.com' }).select('+password');
      expect(admin).toBeDefined();
      expect(admin?.role).toBe('ADMIN');
      expect(admin?.name).toBe('Primary SysAdmin');

      // Password should be hashed via bcrypt, NOT stored plaintext
      expect(admin?.password).not.toBe('super_secure_admin_password_2026');
      const isMatch = await admin?.comparePassword('super_secure_admin_password_2026');
      expect(isMatch).toBe(true);

      // Verify demo creator account was not created
      const demoCreator = await User.findOne({ email: 'creator@aicreatorhub.com' });
      expect(demoCreator).toBeNull();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('should reject provisioning if INITIAL_ADMIN_PASSWORD is shorter than 12 characters', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    process.env.INITIAL_ADMIN_EMAIL = 'admin@example.com';
    process.env.INITIAL_ADMIN_PASSWORD = 'short_10chr'; // 10 chars (< 12)

    try {
      await seedInitialData();

      const userCount = await User.countDocuments();
      expect(userCount).toBe(0);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('should not overwrite or duplicate existing admin in production', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      // Pre-existing admin
      const existing = await User.create({
        name: 'Existing Admin',
        email: 'existing-admin@example.com',
        password: 'existing_admin_password_hash',
        role: 'ADMIN',
      });

      process.env.INITIAL_ADMIN_EMAIL = 'different-admin@example.com';
      process.env.INITIAL_ADMIN_PASSWORD = 'different_password_12345';

      await seedInitialData();

      // Count of admins should still be exactly 1
      const admins = await User.find({ role: 'ADMIN' });
      expect(admins.length).toBe(1);
      expect(admins[0].email).toBe('existing-admin@example.com');
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('should seed local demo accounts in non-production development mode', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      await seedInitialData();

      const admin = await User.findOne({ email: 'admin@aicreatorhub.com' });
      expect(admin).toBeDefined();
      expect(admin?.role).toBe('ADMIN');

      const creator = await User.findOne({ email: 'creator@aicreatorhub.com' });
      expect(creator).toBeDefined();
      expect(creator?.role).toBe('USER');
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});
