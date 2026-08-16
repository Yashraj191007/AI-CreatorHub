import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from '../../validators/authValidator.js';
import { createContentSchema } from '../../validators/contentValidator.js';
import { aiCaptionSchema, aiRewriteSchema, aiSummarizeSchema, aiHashtagSchema } from '../../validators/aiValidator.js';

describe('Authentication Validation Schemas', () => {
  it('should validate a correct registration payload', () => {
    const validRegister = registerSchema.safeParse({
      name: 'Test Creator',
      email: 'test@creator.com',
      password: 'password123',
    });
    expect(validRegister.success).toBe(true);
  });

  it('should fail registration validation for invalid payload', () => {
    const invalidRegister = registerSchema.safeParse({
      name: 'A',
      email: 'invalid-email',
      password: '123',
    });
    expect(invalidRegister.success).toBe(false);
  });

  it('should validate a correct login payload', () => {
    const validLogin = loginSchema.safeParse({
      email: 'test@creator.com',
      password: 'password123',
    });
    expect(validLogin.success).toBe(true);
  });
});

describe('Content Validation Schema', () => {
  it('should validate a correct content payload', () => {
    const validContent = createContentSchema.safeParse({
      title: 'My First Post',
      body: 'This is the content body of my post.',
      category: 'Blog Post',
      tags: ['Tech', 'React'],
      status: 'draft',
    });
    expect(validContent.success).toBe(true);
  });

  it('should fail validation for empty content title/body', () => {
    const invalidContent = createContentSchema.safeParse({
      title: '',
      body: '',
    });
    expect(invalidContent.success).toBe(false);
  });
});

describe('Structured AI Validation Schemas (Zod)', () => {
  it('should validate a correct aiCaptionSchema payload', () => {
    const validResult = aiCaptionSchema.safeParse({
      topicOrText: 'AI Creator Tools',
      tone: 'inspirational',
      platform: 'Instagram',
      count: 3,
    });
    expect(validResult.success).toBe(true);
    if (validResult.success) {
      expect(validResult.data.topicOrText).toBe('AI Creator Tools');
      expect(validResult.data.tone).toBe('inspirational');
    }
  });

  it('should fail aiCaptionSchema when required field topicOrText is missing', () => {
    const invalidResult = aiCaptionSchema.safeParse({
      tone: 'creative',
      platform: 'Instagram',
    });
    expect(invalidResult.success).toBe(false);
  });

  it('should fail aiCaptionSchema for invalid enum value', () => {
    const invalidResult = aiCaptionSchema.safeParse({
      topicOrText: 'Valid topic',
      tone: 'super_funny_custom_tone', // Invalid enum
    });
    expect(invalidResult.success).toBe(false);
  });

  it('should fail aiCaptionSchema for invalid count range', () => {
    const invalidResult = aiCaptionSchema.safeParse({
      topicOrText: 'Valid topic',
      count: 15, // Out of range (max 5)
    });
    expect(invalidResult.success).toBe(false);
  });

  it('should validate a correct aiRewriteSchema payload', () => {
    const validResult = aiRewriteSchema.safeParse({
      content: 'This is a sample blog post to rewrite.',
      targetTone: 'professional',
      goal: 'improve_clarity',
    });
    expect(validResult.success).toBe(true);
  });

  it('should fail aiRewriteSchema when content is too short or missing targetTone', () => {
    const invalidResult = aiRewriteSchema.safeParse({
      content: 'Tiny', // < 5 chars
    });
    expect(invalidResult.success).toBe(false);
  });
});

