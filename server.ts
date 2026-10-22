import 'dotenv/config';
import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { connectDB } from './server/config/db.js';
import { seedInitialData } from './server/utils/seed.js';
import { app } from './server/app.js';
import { connectRedis } from './server/config/redis.js';
import { initCleanupJob } from './server/jobs/cleanupJob.js';
import { initWebSocket } from './server/services/websocketService.js';
import http from 'http';

export async function startServer(): Promise<http.Server> {
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Connect Database & Seed Initial Data
  await connectDB();
  await seedInitialData();
  
  // Initialize Redis
  await connectRedis();
  
  // Initialize Scheduled Jobs (Cron)
  if (process.env.NODE_ENV === 'production') {
    if (process.env.ENABLE_CRON === 'true') {
      initCleanupJob();
    } else {
      console.log('[Server] Scheduled cron cleanup disabled on this instance by default. Set ENABLE_CRON=true to designate this instance as the worker.');
    }
  } else if (process.env.ENABLE_CRON !== 'false') {
    initCleanupJob();
  }

  // Vite Integration for Development / Static Production Serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);
  
  // Initialize WebSocket server
  initWebSocket(server);

  return new Promise<http.Server>((resolve, reject) => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`AI CreatorHub server running on http://0.0.0.0:${PORT}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

export function handleStartupError(err: unknown): void {
  console.error('Failed to start server:', err);
  process.exit(1);
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch(handleStartupError);
}
