import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'aicreatorhub_secure_jwt_secret_key_2026_xyz';

let io: Server | null = null;

export const initWebSocket = (server: HttpServer) => {
  io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
    }
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
      // Attach user ID to socket
      (socket as any).userId = decoded.id;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;
    // Join a private room for this specific user
    const roomName = `user_${userId}`;
    socket.join(roomName);
    
    // console.log(`[WebSocket] Client connected: user_${userId}`);

    socket.on('disconnect', () => {
      // console.log(`[WebSocket] Client disconnected: user_${userId}`);
    });
  });
};

export const emitToUser = (userId: string, eventName: string, data: any) => {
  if (io) {
    // Note: Do not emit sensitive data (passwords, JWTs, API keys) in WebSocket events.
    io.to(`user_${userId}`).emit(eventName, data);
  }
};
