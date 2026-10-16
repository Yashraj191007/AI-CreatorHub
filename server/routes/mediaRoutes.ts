import { Router } from 'express';
import { uploadMedia, getUserMedia, uploadMiddleware } from '../controllers/mediaController.js';
import { protect } from '../middleware/authMiddleware.js';
import { uploadLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(protect);

router.post('/upload', uploadLimiter, uploadMiddleware.single('file'), uploadMedia);
router.get('/', getUserMedia);

export default router;

