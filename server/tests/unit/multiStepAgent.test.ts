import { describe, it, expect } from 'vitest';
import {
  executePlannerStage,
  executeRetrieverStage,
  executeGeneratorStage,
  executeRefinerStage,
  runMultiStepAgent,
} from '../../services/multiStepAgentService.js';
import mongoose from 'mongoose';

describe('Multi-Step AI Agent Workflow Engine', () => {
  it('should execute Stage 1 (Planner) and output structured content strategy plan', async () => {
    const plan = await executePlannerStage('Next.js performance optimization', 'LinkedIn', 'Informative');

    expect(plan.output.targetAudience).toBeDefined();
    expect(Array.isArray(plan.output.keyAngles)).toBe(true);
    expect(Array.isArray(plan.output.suggestedSections)).toBe(true);
    expect(plan.output.suggestedSections.length).toBeGreaterThanOrEqual(3);
    expect(plan.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should execute Stage 2 (Retriever) and output context text and chunks', async () => {
    const mockUserId = new mongoose.Types.ObjectId().toString();
    const ret = await executeRetrieverStage(mockUserId, 'performance Next.js');

    expect(ret.output.contextText).toBeDefined();
    expect(Array.isArray(ret.output.retrievedChunks)).toBe(true);
  });

  it('should execute Stage 3 (Generator) using plan and context', async () => {
    const planOutput = {
      targetAudience: 'Web developers',
      keyAngles: ['SSR benefits', 'Caching strategy', 'Image optimization'],
      suggestedSections: ['Introduction', 'Core Techniques', 'Conclusion'],
      retrievalKeywords: 'Next.js performance',
    };

    const gen = await executeGeneratorStage('Next.js performance', 'LinkedIn', planOutput, 'Context about Next.js');

    expect(gen.output.rawDraft).toBeDefined();
    expect(gen.output.sectionCount).toBeGreaterThanOrEqual(3);
  });

  it('should execute Stage 4 (Refiner) and output quality metrics and hashtags', async () => {
    const rawDraft = '### Introduction\nOptimizing web apps.\n\n### Core Techniques\nUse SSR and caching.\n\n### Conclusion\nSummary takeaway. #NextJS #WebDev';
    const ref = await executeRefinerStage(rawDraft, false);

    expect(ref.output.finalContent).toBeDefined();
    expect(ref.output.hashtags).toContain('#NextJS');
    expect(ref.output.qualityPassed).toBe(true);
    expect(ref.output.readabilityScore).toBeGreaterThan(0);
  });

  it('should orchestrate complete 4-stage multi-step agent flow end-to-end', async () => {
    const mockUserId = new mongoose.Types.ObjectId().toString();
    const result = await runMultiStepAgent(mockUserId, 'Building scalable microservices', 'Twitter', 'Technical');

    expect(result.executionId).toBeDefined();
    expect(result.stages.planner.status).toBe('completed');
    expect(result.stages.retriever.status).toBe('completed');
    expect(result.stages.generator.status).toBe('completed');
    expect(result.stages.refiner.status).toBe('completed');

    expect(result.stages.planner.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.stages.generator.output.rawDraft.length).toBeGreaterThan(0);
    expect(result.stages.refiner.output.hashtags.length).toBeGreaterThan(0);
    expect(result.totalUsage.totalTokens).toBeGreaterThan(0);
    expect(result.totalUsage.estimatedCostUSD).toBeGreaterThan(0);
  });
});
