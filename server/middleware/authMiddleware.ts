import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User.js';

export interface AuthRequest extends Request {
  user?: IUser;
}

const JWT_SECRET = process.env.JWT_SECRET || 'aicreatorhub_secure_jwt_secret_key_2026_xyz';

export async function protect(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    let token: string | undefined;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({ success: false, error: 'Not authorized, token missing' });
      return;
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      res.status(401).json({ success: false, error: 'User account not found' });
      return;
    }

    if (user.status === 'disabled') {
      res.status(403).json({ success: false, error: 'User account is disabled by administrator' });
      return;
    }

    req.user = user;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, error: 'Not authorized, token has expired' });
      return;
    }
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({ success: false, error: 'Not authorized, invalid token signature or malformed token' });
      return;
    }
    res.status(401).json({ success: false, error: 'Not authorized, invalid or expired token' });
  }
}

export function authorize(...roles: Array<'USER' | 'ADMIN'>) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `User role '${req.user.role}' is not authorized to perform this action`,
      });
      return;
    }

    next();
  };
}
