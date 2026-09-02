import { describe, it, expect } from 'vitest';
import {
  executePlannerStage,
  executeRetrieverStage,
  executeGeneratorStage,
  executeRefinerStage,
  AgentOrchestrator,
} from '../../services/multiStepAgentService.js';
import mongoose from 'mongoose';

describe('Multi-Step AI Agent Workflow Engine', () => {
  it('should execute Stage 1 (Planner) and output structured content strategy plan matching SDK responseSchema', async () => {
    const plan = await executePlannerStage('Next.js performance optimization', 'LinkedIn', 'Informative');

    // Verify all fields required by PLANNER_OUTPUT_SCHEMA are present and correctly typed
    expect(typeof plan.output.targetAudience).toBe('string');
    expect(plan.output.targetAudience.length).toBeGreaterThan(0);
    expect(Array.isArray(plan.output.keyAngles)).toBe(true);
    expect(plan.output.keyAngles.length).toBeGreaterThanOrEqual(1);
    plan.output.keyAngles.forEach((angle) => expect(typeof angle).toBe('string'));
    expect(Array.isArray(plan.output.suggestedSections)).toBe(true);
    expect(plan.output.suggestedSections.length).toBeGreaterThanOrEqual(1);
    plan.output.suggestedSections.forEach((section) => expect(typeof section).toBe('string'));
    expect(typeof plan.output.retrievalKeywords).toBe('string');
    expect(plan.output.retrievalKeywords.length).toBeGreaterThan(0);
    expect(plan.durationMs).toBeGreaterThanOrEqual(0);

    // Verify the output is directly JSON-serialisable (no extra wrapper/regex required)
    const serialised = JSON.stringify(plan.output);
    const roundTripped = JSON.parse(serialised);
    expect(roundTripped.targetAudience).toBe(plan.output.targetAudience);
    expect(roundTripped.retrievalKeywords).toBe(plan.output.retrievalKeywords);
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
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.execute(mockUserId, 'Building scalable microservices', 'Twitter', 'Technical');

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
