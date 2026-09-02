import { Router } from 'express';
import {
  handleGenerateCaptions,
  handleGenerateContent,
  handleRewriteContent,
  handleSummarizeContent,
  handleGenerateHashtags,
  handleAssistantToolChat,
  getAIHistory,
  handleMultiStepAgent,
  handleRAGSearch,
  handleIndexKnowledgeDoc,
  handleStreamContent,
  handleGetAIUsageStats,
} from '../controllers/aiController.js';
import { protect } from '../middleware/authMiddleware.js';
import { aiLimiter } from '../middleware/rateLimiter.js';
import { inputSanitization } from '../middleware/inputSanitization.js';

const router = Router();

router.use(protect);
router.use(aiLimiter);

// Apply input sanitization globally to all AI routes since they process user text
router.use(inputSanitization);

router.post('/generate-captions', handleGenerateCaptions);
router.post('/generate-content', handleGenerateContent);
router.post('/rewrite', handleRewriteContent);
router.post('/summarize', handleSummarizeContent);
router.post('/generate-hashtags', handleGenerateHashtags);
router.post('/assistant', handleAssistantToolChat);
router.get('/history', getAIHistory);

// Phase 1 Assessor Concepts Routes
router.post('/multi-step-agent', handleMultiStepAgent);
router.post('/rag', handleRAGSearch);
router.post('/rag/index', handleIndexKnowledgeDoc);
router.post('/stream', handleStreamContent);
router.get('/usage-stats', handleGetAIUsageStats);

export default router;

