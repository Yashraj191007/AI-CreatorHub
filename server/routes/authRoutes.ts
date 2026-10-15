import { Router } from 'express';
import { register, login, getMe, updateProfile, changePassword } from '../controllers/authController.js';
import {
  initiateGoogleAuth,
  handleGoogleCallback,
  exchangeOAuthCode,
  getOAuthProviders,
} from '../controllers/oauthController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Local Email/Password Authentication
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/change-password', protect, changePassword);

// OAuth 2.0 Social Authentication
router.get('/oauth/providers', getOAuthProviders);
router.get('/google', initiateGoogleAuth);
router.get('/google/callback', handleGoogleCallback);
router.post('/google/callback', authLimiter, handleGoogleCallback);
router.post('/oauth/google', authLimiter, handleGoogleCallback);
router.post('/oauth/exchange-code', authLimiter, exchangeOAuthCode);

export default router;

