import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoMemoryServer: MongoMemoryServer | null = null;

export async function connectDB(): Promise<void> {
  try {
    const uri = process.env.MONGODB_URI;

    // In production, strictly require valid MONGODB_URI and fail-closed
    if (process.env.NODE_ENV === 'production') {
      if (!uri) {
        throw new Error(
          '[FATAL] MONGODB_URI environment variable is required in production. Embedded MongoMemoryServer fallback is disabled in production.'
        );
      }
      console.log('Connecting to configured production MongoDB URI...');
      await mongoose.connect(uri);
      console.log('Connected to MongoDB successfully.');
      return;
    }

    if (uri && uri !== 'mongodb://localhost:27017/aicreatorhub') {
      try {
        console.log('Connecting to configured MongoDB URI...');
        await mongoose.connect(uri);
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
    console.error('Database connection error:', error);
  }
}

export async function closeDB(): Promise<void> {
  await mongoose.disconnect();
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
  }
}
