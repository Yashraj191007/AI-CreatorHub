import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiter.js';

import mongoose from 'mongoose';
import prisma from './config/prisma.js';
import { redisClient } from './config/redis.js';

// Route Imports
import authRoutes from './routes/authRoutes.js';
import contentRoutes from './routes/contentRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import billingRoutes from './routes/billingRoutes.js';
const app = express();
app.set('trust proxy', 1);

// Security Middlewares
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled for Vite dev server compatibility inside preview iframe
    crossOriginEmbedderPolicy: false,
  })
);

/**
 * Resolves the explicit set of allowed frontend origins from configuration.
 * Reads APP_URL and CORS_ALLOWED_ORIGINS environment variables.
 * In non-production environments, includes standard local development origins.
 * Strictly validates origins and discards malformed entries to prevent accidental trust.
 */
export function getAllowedOrigins(): string[] {
  const origins = new Set<string>();

  const addOrigin = (rawUrl?: string) => {
    if (!rawUrl) return;
    const entries = rawUrl.split(',');
    for (const entry of entries) {
      const trimmed = entry.trim();
      if (!trimmed || trimmed === '*' || trimmed.toLowerCase() === 'null') continue;
      try {
        const urlToParse = /^https?:\/\//i.test(trimmed)
          ? trimmed
          : `https://${trimmed}`;
        const parsed = new URL(urlToParse);
        const protocol = parsed.protocol.toLowerCase();
        const hostname = parsed.hostname.toLowerCase();
        const origin = parsed.origin.toLowerCase();

        // Must use HTTP/HTTPS and have a valid, non-null hostname
        if ((protocol === 'http:' || protocol === 'https:') && hostname && origin !== 'null') {
          // Must be a valid domain with a dot, localhost, or valid loopback IP
          if (hostname.includes('.') || hostname === 'localhost' || hostname === '127.0.0.1') {
            origins.add(origin);
          }
        }
      } catch {
        // Discard malformed entries; do not add invalid strings to allowed origins
      }
    }
  };

  addOrigin(process.env.APP_URL);
  addOrigin(process.env.CORS_ALLOWED_ORIGINS);

  // In non-production environments (development, test), include common local dev origins
  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://localhost:5000');
    origins.add('http://localhost:5173');
    origins.add('http://127.0.0.1:3000');
    origins.add('http://127.0.0.1:5000');
    origins.add('http://127.0.0.1:5173');
  }

  return Array.from(origins);
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no Origin header (e.g. server-to-server, curl, health checks)
      if (!origin) {
        return callback(null, false);
      }

      const allowed = getAllowedOrigins();
      const normalizedOrigin = origin.trim().replace(/\/+$/, '').toLowerCase();

      if (allowed.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      // Reject untrusted origins without reflecting them in Access-Control-Allow-Origin
      return callback(null, false);
    },
    credentials: true,
  })
);

// Body Parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security: Block direct public access to backend bundle files, source maps, and server artifacts
app.use((req, res, next) => {
  const cleanPath = req.path.replace(/\0/g, '');
  const baseName = path.basename(cleanPath).toLowerCase();
  if (
    baseName === 'server.cjs' ||
    baseName.startsWith('server.') ||
    baseName.endsWith('.map') ||
    cleanPath.includes('/server.cjs')
  ) {
    res.status(404).json({ success: false, error: 'Not found' });
    return;
  }
  next();
});

// General API Rate Limiter
app.use('/api', apiLimiter);

// Static uploads serving
const uploadDir = path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(uploadDir));

// Process Liveness Probe
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Dependency Readiness Probe (checks MongoDB, PostgreSQL, and Redis without exposing credentials)
app.get('/api/health/readiness', async (_req, res) => {
  const isMongoConnected = mongoose.connection.readyState === 1;
  let isPostgresConnected = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    isPostgresConnected = true;
  } catch {
    isPostgresConnected = false;
  }

  const isRedisConnected = Boolean(redisClient.isOpen);
  const allowedOrigins = getAllowedOrigins();
  const isCorsConfigured = process.env.NODE_ENV !== 'production' || allowedOrigins.length > 0;

  // In production, Redis and configured CORS allowed origins are strictly required
  const isReady =
    process.env.NODE_ENV === 'production'
      ? isMongoConnected && isPostgresConnected && isRedisConnected && isCorsConfigured
      : isMongoConnected && isPostgresConnected;

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'unhealthy',
    services: {
      mongodb: isMongoConnected ? 'connected' : 'disconnected',
      postgresql: isPostgresConnected ? 'connected' : 'disconnected',
      redis: isRedisConnected ? 'connected' : 'disconnected',
      cors: isCorsConfigured ? 'configured' : 'missing_allowed_origins',
    },
    timestamp: new Date().toISOString(),
  });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/billing', billingRoutes);

// Catch-all 404 handler for unmatched /api routes (covers both /api and /api/*)
app.all(['/api', '/api/*'], (_req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
  });
});

// Global Error Handler for API
app.use(errorHandler);

export { app };
