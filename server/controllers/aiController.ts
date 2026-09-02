import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/authMiddleware.js';
import { AIRequest } from '../models/AIRequest.js';
import {
  generateCaptions,
  generateContentDraft,
  rewriteContent,
  summarizeContent,
  generateHashtags,
  runAssistantToolChat,
  generateContentStream,
} from '../services/geminiService.js';
import { runMultiStepAgent } from '../services/multiStepAgentService.js';
import { generateRAGAugmentedResponse, indexKnowledgeDocument } from '../services/ragService.js';
import { aggregateUsageStats } from '../utils/costMonitor.js';

import {
  aiCaptionSchema,
  aiRewriteSchema,
  aiSummarizeSchema,
  aiHashtagSchema,
  aiAssistantChatSchema,
} from '../validators/aiValidator.js';

export async function handleGenerateCaptions(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = aiCaptionSchema.parse(req.body);
    const userId = req.user?._id;

    const result = await generateCaptions(
      validated.topicOrText,
      validated.tone,
      validated.platform,
      validated.count
    );

    await AIRequest.create({
      userId,
      operationType: 'generateCaptions',
      prompt: validated.topicOrText,
      result: JSON.stringify(result.captions),
      isSuspicious: result.isSuspicious,
      suspiciousReason: result.suspiciousReason || '',
      toolCallsCount: 0,
    });

    res.json({
      success: true,
      captions: result.captions,
      isSuspicious: result.isSuspicious,
      warning: result.isSuspicious ? 'Prompt injection guard detected potential instruction manipulation.' : undefined,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleGenerateContent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { topic, category = 'Social Media', platform = 'General', instructions } = req.body;
    const userId = req.user?._id;

    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
      res.status(400).json({ success: false, error: 'Topic is required' });
      return;
    }

    const result = await generateContentDraft(topic, category, platform, instructions);

    await AIRequest.create({
      userId,
      operationType: 'generateContent',
      prompt: `${topic} (${category} - ${platform})`,
      result: result.draft,
      isSuspicious: result.isSuspicious,
      suspiciousReason: result.suspiciousReason || '',
      toolCallsCount: 0,
    });

    res.json({
      success: true,
      draft: result.draft,
      isSuspicious: result.isSuspicious,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleRewriteContent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = aiRewriteSchema.parse(req.body);
    const userId = req.user?._id;

    const result = await rewriteContent(validated.content, validated.targetTone, validated.goal);

    await AIRequest.create({
      userId,
      operationType: 'rewriteContent',
      prompt: `Tone: ${validated.targetTone}, Goal: ${validated.goal}`,
      result: result.rewritten,
      isSuspicious: result.isSuspicious,
      suspiciousReason: result.suspiciousReason || '',
      toolCallsCount: 0,
    });

    res.json({
      success: true,
      rewritten: result.rewritten,
      isSuspicious: result.isSuspicious,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleSummarizeContent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = aiSummarizeSchema.parse(req.body);
    const userId = req.user?._id;

    const result = await summarizeContent(validated.content, validated.format);

    await AIRequest.create({
      userId,
      operationType: 'summarizeContent',
      prompt: `Summarize in ${validated.format}`,
      result: result.summary,
      isSuspicious: result.isSuspicious,
      suspiciousReason: result.suspiciousReason || '',
      toolCallsCount: 0,
    });

    res.json({
      success: true,
      summary: result.summary,
      isSuspicious: result.isSuspicious,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleGenerateHashtags(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = aiHashtagSchema.parse(req.body);
    const userId = req.user?._id;

    const result = await generateHashtags(validated.topic, validated.niche, validated.count);

    await AIRequest.create({
      userId,
      operationType: 'generateHashtags',
      prompt: validated.topic,
      result: result.hashtags.join(' '),
      isSuspicious: result.isSuspicious,
      suspiciousReason: result.suspiciousReason || '',
      toolCallsCount: 0,
    });

    res.json({
      success: true,
      hashtags: result.hashtags,
      isSuspicious: result.isSuspicious,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleAssistantToolChat(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = aiAssistantChatSchema.parse(req.body);
    const userId = req.user?._id?.toString() || '';

    const result = await runAssistantToolChat(userId, validated.message);

    await AIRequest.create({
      userId: req.user?._id,
      operationType: 'assistantToolChat',
      prompt: validated.message,
      result: result.reply,
      isSuspicious: result.isSuspicious,
      suspiciousReason: result.suspiciousReason || '',
      toolCallsCount: result.toolCallsCount,
    });

    res.json({
      success: true,
      reply: result.reply,
      toolCallsCount: result.toolCallsCount,
      isSuspicious: result.isSuspicious,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAIHistory(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?._id;
    const history = await AIRequest.find({ userId }).sort({ createdAt: -1 }).limit(20);

    res.json({
      success: true,
      history,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleMultiStepAgent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { topic, platform = 'LinkedIn', tone = 'Professional' } = req.body;
    if (!topic || typeof topic !== 'string') {
      res.status(400).json({ success: false, error: 'Topic is required' });
      return;
    }
    const userId = req.user?._id?.toString() || '';

    const agentResult = await runMultiStepAgent(userId, topic, platform, tone);

    await AIRequest.create({
      userId: req.user?._id,
      operationType: 'multiStepAgent',
      prompt: topic,
      result: agentResult.stages.refiner.output.finalContent,
      isSuspicious: agentResult.isSuspicious,
      suspiciousReason: agentResult.suspiciousReason || '',
      promptTokens: agentResult.totalUsage.promptTokens,
      candidateTokens: agentResult.totalUsage.candidateTokens,
      totalTokens: agentResult.totalUsage.totalTokens,
      estimatedCostUSD: agentResult.totalUsage.estimatedCostUSD,
    });

    res.json({
      success: true,
      data: agentResult,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleRAGSearch(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { query, topK = 3 } = req.body;
    if (!query || typeof query !== 'string') {
      res.status(400).json({ success: false, error: 'Query is required' });
      return;
    }
    const userId = req.user?._id?.toString() || '';

    const ragResult = await generateRAGAugmentedResponse(userId, query, topK);

    await AIRequest.create({
      userId: req.user?._id,
      operationType: 'ragSearch',
      prompt: query,
      result: ragResult.reply,
      isSuspicious: ragResult.isSuspicious,
      promptTokens: ragResult.usage.promptTokens,
      candidateTokens: ragResult.usage.candidateTokens,
      totalTokens: ragResult.usage.totalTokens,
      estimatedCostUSD: ragResult.usage.estimatedCostUSD,
    });

    res.json({
      success: true,
      data: ragResult,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleIndexKnowledgeDoc(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { title, content, category = 'General' } = req.body;
    if (!title || !content) {
      res.status(400).json({ success: false, error: 'Title and content are required' });
      return;
    }
    const userId = req.user?._id?.toString() || '';

    const indexRes = await indexKnowledgeDocument(userId, title, content, category);

    res.json({
      success: true,
      message: `Successfully indexed ${indexRes.indexedChunksCount} vector document chunks`,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleStreamContent(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ success: false, error: 'Prompt is required' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const result = await generateContentStream(prompt, (chunk) => {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    });

    res.write(`data: ${JSON.stringify({ done: true, result: result.fullText })}\n\n`);
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      next(error);
    } else {
      res.write(`data: ${JSON.stringify({ error: (error as Error).message })}\n\n`);
      res.end();
    }
  }
}

export async function handleGetAIUsageStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?._id;
    const requests = await AIRequest.find({ userId });
    const stats = aggregateUsageStats(requests);

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    next(error);
  }
}

