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

async function startServer() {
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Connect Database & Seed Initial Data
  await connectDB();
  await seedInitialData();
  
  // Initialize Redis
  await connectRedis();
  
  // Initialize Scheduled Jobs (Cron)
  initCleanupJob();

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

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`AI CreatorHub server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
