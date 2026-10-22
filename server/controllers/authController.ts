import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { AuthRequest } from '../middleware/authMiddleware.js';
import { registerSchema, loginSchema, updateProfileSchema, changePasswordSchema } from '../validators/authValidator.js';

const JWT_SECRET = process.env.JWT_SECRET || 'aicreatorhub_secure_jwt_secret_key_2026_xyz';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function generateToken(id: string): string {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
}

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = registerSchema.parse(req.body);

    const existingUser = await User.findOne({ email: validated.email });
    if (existingUser) {
      res.status(409).json({ success: false, error: 'User with this email already exists' });
      return;
    }

    const user = await User.create({
      name: validated.name,
      email: validated.email,
      password: validated.password,
      role: 'USER',
      authProvider: 'local',
    });

    const token = generateToken(user._id.toString());

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        bio: user.bio,
        avatar: user.avatar,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = loginSchema.parse(req.body);

    const user = await User.findOne({ email: validated.email }).select('+password');
    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    if (user.status === 'disabled') {
      res.status(403).json({ success: false, error: 'Your account has been disabled by an admin.' });
      return;
    }

    if (!user.password) {
      res.status(401).json({
        success: false,
        error: `This account was registered using ${user.authProvider || 'Google'} OAuth. Please sign in with ${user.authProvider || 'Google'}.`,
      });
      return;
    }

    const isMatch = await user.comparePassword(validated.password);
    if (!isMatch) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const token = generateToken(user._id.toString());

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        bio: user.bio,
        avatar: user.avatar,
        socialHandles: user.socialHandles,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }
    res.json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = updateProfileSchema.parse(req.body);
    const userId = req.user?._id;

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    if (validated.name !== undefined) user.name = validated.name;
    if (validated.bio !== undefined) user.bio = validated.bio;
    if (validated.avatar !== undefined) user.avatar = validated.avatar;
    if (validated.socialHandles !== undefined) {
      user.socialHandles = {
        ...user.socialHandles,
        ...validated.socialHandles,
      };
    }

    await user.save();

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = changePasswordSchema.parse(req.body);
    const userId = req.user?._id;

    const user = await User.findById(userId).select('+password');
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    const isMatch = await user.comparePassword(validated.currentPassword);
    if (!isMatch) {
      res.status(400).json({ success: false, error: 'Current password is incorrect' });
      return;
    }

    user.password = validated.newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    next(error);
  }
}
