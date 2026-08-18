import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { User } from '../../models/User.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup.js';

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await clearTestDB();
});

describe('User Model (Password Hashing)', () => {
  it('should hash the password before saving to the database', async () => {
    const rawPassword = 'supersecretpassword';
    const user = new User({
      name: 'Hash Test User',
      email: 'hash@example.com',
      password: rawPassword,
    });

    await user.save();

    expect(user.password).toBeDefined();
    expect(user.password).not.toBe(rawPassword);
  });

  it('should return true for comparePassword with the correct password', async () => {
    const rawPassword = 'correctpassword';
    const user = new User({
      name: 'Compare Test',
      email: 'compare@example.com',
      password: rawPassword,
    });
    await user.save();

    // Fetch user explicitly with password selected (since schema has select: false by default)
    const fetchedUser = await User.findById(user._id).select('+password');
    expect(fetchedUser).toBeDefined();
    
    if (fetchedUser) {
      const isMatch = await fetchedUser.comparePassword(rawPassword);
      expect(isMatch).toBe(true);
    }
  });

  it('should return false for comparePassword with incorrect password', async () => {
    const user = new User({
      name: 'Wrong Pass Test',
      email: 'wrongpass@example.com',
      password: 'mypassword',
    });
    await user.save();

    const fetchedUser = await User.findById(user._id).select('+password');
    if (fetchedUser) {
      const isMatch = await fetchedUser.comparePassword('incorrectpassword');
      expect(isMatch).toBe(false);
    }
  });
});

describe('Mongoose User Model - Explicit MongoDB CRUD Operations', () => {
  it('should CREATE a new user document in MongoDB with default fields', async () => {
    const newUser = await User.create({
      name: 'Alex Creator',
      email: 'alex@example.com',
      password: 'securePassword123',
      role: 'USER',
    });

    expect(newUser._id).toBeDefined();
    expect(newUser.name).toBe('Alex Creator');
    expect(newUser.email).toBe('alex@example.com');
    expect(newUser.role).toBe('USER');
    expect(newUser.status).toBe('active'); // Default Mongoose schema value
    expect(newUser.createdAt).toBeInstanceOf(Date);
  });

  it('should READ an existing user document from MongoDB by ID and by email query', async () => {
    const created = await User.create({
      name: 'Read Target User',
      email: 'readtarget@example.com',
      password: 'password123',
    });

    // READ by ID
    const foundById = await User.findById(created._id);
    expect(foundById).not.toBeNull();
    expect(foundById?.name).toBe('Read Target User');

    // READ by query filter
    const foundByEmail = await User.findOne({ email: 'readtarget@example.com' });
    expect(foundByEmail).not.toBeNull();
    expect(foundByEmail?._id.toString()).toBe(created._id.toString());
  });

  it('should UPDATE user properties in MongoDB and persist modifications', async () => {
    const created = await User.create({
      name: 'Initial Name',
      email: 'update@example.com',
      password: 'password123',
      bio: 'Initial bio text',
    });

    // Perform UPDATE via findByIdAndUpdate
    const updatedUser = await User.findByIdAndUpdate(
      created._id,
      { bio: 'Updated bio statement', status: 'disabled' },
      { returnDocument: 'after' }
    );

    expect(updatedUser).not.toBeNull();
    expect(updatedUser?.bio).toBe('Updated bio statement');
    expect(updatedUser?.status).toBe('disabled');

    // Verify DB state persistence
    const reFetched = await User.findById(created._id);
    expect(reFetched?.bio).toBe('Updated bio statement');
    expect(reFetched?.status).toBe('disabled');
  });

  it('should DELETE a user document from MongoDB and confirm removal', async () => {
    const created = await User.create({
      name: 'Delete Target',
      email: 'deletetarget@example.com',
      password: 'password123',
    });

    // Verify document exists before deletion
    const beforeDelete = await User.findById(created._id);
    expect(beforeDelete).not.toBeNull();

    // Perform DELETE operation
    const deletedUser = await User.findByIdAndDelete(created._id);
    expect(deletedUser).not.toBeNull();
    expect(deletedUser?._id.toString()).toBe(created._id.toString());

    // Verify document no longer exists in MongoDB
    const afterDelete = await User.findById(created._id);
    expect(afterDelete).toBeNull();
  });
});

