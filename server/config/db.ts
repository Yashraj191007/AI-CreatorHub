import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoMemoryServer: MongoMemoryServer | null = null;

/**
 * Sanitizes MongoDB error messages by redacting credentials and connection secrets.
 */
export function sanitizeMongoError(err: unknown): string {
  if (!err) return 'Unknown database error';
  const raw = err instanceof Error ? err.message : String(err);
  // Redact credentials from mongodb:// or mongodb+srv:// URI schemes
  let sanitized = raw.replace(/(mongodb(?:\+srv)?:\/\/)[^\s@]+@/gi, '$1***:***@');
  // Redact sensitive query parameter values
  sanitized = sanitized.replace(/([?&](?:password|pwd|secret|token)=)[^&]+/gi, '$1***');
  const errName = err instanceof Error ? err.name : 'MongoConnectionError';
  return `${errName}: ${sanitized}`;
}

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI?.trim();

  // In production, strictly require valid MONGODB_URI and fail-closed
  if (process.env.NODE_ENV === 'production') {
    if (!uri) {
      const errorMsg =
        '[FATAL] MONGODB_URI environment variable is required in production. Embedded MongoMemoryServer fallback is disabled in production.';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    console.log('Connecting to configured production MongoDB URI...');
    try {
      await mongoose.connect(uri);
      console.log('Connected to MongoDB successfully.');
      return;
    } catch (err) {
      const sanitized = sanitizeMongoError(err);
      console.error(`[FATAL] Failed to connect to production MongoDB: ${sanitized}`);
      throw new Error(`Production MongoDB connection failed: ${sanitized}`);
    }
  }

  // Development and Test: preserve fallback behavior
  try {
    if (uri && uri !== 'mongodb://localhost:27017/aicreatorhub') {
      try {
        console.log('Connecting to configured MongoDB URI...');
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        console.log('Connected to MongoDB successfully.');
        return;
      } catch (err) {
        console.warn('Failed to connect to external MONGODB_URI, falling back to embedded MongoDB:', err);
      }
    }

    // Try standard local connection first
    try {
      if (uri) {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
        console.log('Connected to local MongoDB instance.');
        return;
      }
    } catch {
      console.log('Local MongoDB not accessible. Starting embedded MongoMemoryServer...');
    }

    // Fallback to MongoMemoryServer for out-of-the-box working database in development/test
    mongoMemoryServer = await MongoMemoryServer.create({
      instance: {
        dbName: 'aicreatorhub',
      },
    });
    const memoryUri = mongoMemoryServer.getUri();
    await mongoose.connect(memoryUri);
    console.log(`Connected to embedded MongoDB at ${memoryUri}`);
  } catch (error) {
    console.error('Database connection error in development/test fallback:', error);
    throw error;
  }
}

export async function closeDB(): Promise<void> {
  await mongoose.disconnect();
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
    mongoMemoryServer = null;
  }
}
