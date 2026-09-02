import { Router } from 'express';
import {
  createContent,
  getContents,
  getContentById,
  updateContent,
  deleteContent,
  getDashboardStats,
} from '../controllers/contentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { inputSanitization } from '../middleware/inputSanitization.js';

const router = Router();

router.use(protect);

router.get('/dashboard/stats', getDashboardStats);

// Apply input sanitization to routes that accept user-generated content
router.post('/', inputSanitization, createContent);
router.get('/', getContents);
router.get('/:id', getContentById);
router.put('/:id', inputSanitization, updateContent);
router.delete('/:id', deleteContent);

export default router;
