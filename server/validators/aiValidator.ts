import { z } from 'zod';

export const aiCaptionSchema = z.object({
  topicOrText: z.string().min(3, 'Topic or content must be at least 3 characters').max(3000, 'Content exceeds 3000 max characters'),
  tone: z.enum(['professional', 'casual', 'creative', 'urgent', 'witty', 'inspirational']).optional().default('creative'),
  platform: z.enum(['Instagram', 'YouTube', 'X/Twitter', 'LinkedIn', 'TikTok', 'Blog', 'General']).optional().default('Instagram'),
  count: z.number().min(1).max(5).optional().default(3),
});

export const aiRewriteSchema = z.object({
  content: z.string().min(5, 'Content must be at least 5 characters').max(5000),
  targetTone: z.enum(['professional', 'casual', 'creative', 'urgent', 'witty', 'inspirational']),
  goal: z.enum(['improve_clarity', 'change_tone', 'expand', 'shorten']).optional().default('change_tone'),
});

export const aiSummarizeSchema = z.object({
  content: z.string().min(10, 'Content must be at least 10 characters').max(10000),
  format: z.enum(['bullet_points', 'paragraph', 'one_liner']).optional().default('bullet_points'),
});

export const aiHashtagSchema = z.object({
  topic: z.string().min(2, 'Topic must be at least 2 characters').max(500),
  niche: z.string().optional().default('General'),
  count: z.number().min(5).max(30).optional().default(15),
});

export const aiAssistantChatSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000),
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    parts: z.array(z.object({ text: z.string() })),
  })).optional().default([]),
});

export const aiGenerateContentSchema = z.object({
  topic: z.string().min(2, 'Topic is required and must be at least 2 characters').max(1000),
  category: z.enum(['Social Media', 'Blog Post', 'Video Script', 'Newsletter', 'Ad Copy', 'Other']).optional().default('Social Media'),
  platform: z.enum(['Instagram', 'YouTube', 'X/Twitter', 'LinkedIn', 'TikTok', 'Blog', 'General']).optional().default('General'),
  instructions: z.string().max(2000).optional(),
});

