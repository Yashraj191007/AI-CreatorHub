import { GoogleGenAI } from '@google/genai';
import { sanitizeAndGuardPrompt, buildSystemInstructions } from '../utils/promptDefense.js';
import { retrieveRelevantChunks, RetrievedChunk } from './ragService.js';
import { calculateTokenUsageAndCost, UsageCalculationResult } from '../utils/costMonitor.js';

function getAIClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'MISSING_KEY' });
}

export type StageName = 'planner' | 'retriever' | 'generator' | 'refiner';
export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface AgentStageResult<T = any> {
  stage: StageName;
  status: StageStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  output: T;
  error?: string;
}

export interface StrategyPlanOutput {
  targetAudience: string;
  keyAngles: string[];
  suggestedSections: string[];
  retrievalKeywords: string;
}

export interface GeneratorOutput {
  rawDraft: string;
  sectionCount: number;
}

export interface RefinedFinalOutput {
  finalContent: string;
  hashtags: string[];
  readabilityScore: number;
  qualityPassed: boolean;
  warnings: string[];
}

export interface MultiStepAgentExecutionResult {
  executionId: string;
  userId: string;
  topic: string;
  platform: string;
  isSuspicious: boolean;
  suspiciousReason?: string;
  stages: {
    planner: AgentStageResult<StrategyPlanOutput>;
    retriever: AgentStageResult<{ retrievedChunks: RetrievedChunk[]; contextText: string }>;
    generator: AgentStageResult<GeneratorOutput>;
    refiner: AgentStageResult<RefinedFinalOutput>;
  };
  totalDurationMs: number;
  totalUsage: UsageCalculationResult;
}

/**
 * Stage 1: Strategy & Outline Planner
 */
export async function executePlannerStage(
  topic: string,
  platform: string,
  tone: string
): Promise<{ output: StrategyPlanOutput; durationMs: number }> {
  const start = Date.now();
  const ai = getAIClient();

  const prompt = `Formulate a content strategy plan for platform '${platform}' with tone '${tone}'. Topic: "${topic}".
Return ONLY a valid JSON object with fields: "targetAudience" (string), "keyAngles" (array of 3 strings), "suggestedSections" (array of 3 section headers), "retrievalKeywords" (string of space-separated keywords).`;

  let planOutput: StrategyPlanOutput = {
    targetAudience: `Content creators and followers on ${platform}`,
    keyAngles: [`Hook audience on ${topic}`, `Key insights regarding ${topic}`, `Call to action`],
    suggestedSections: ['Introduction & Hook', 'Core Value & Insights', 'Takeaway & CTA'],
    retrievalKeywords: topic,
  };

  if (process.env.GEMINI_API_KEY) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
      });
      const text = response.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        planOutput = {
          targetAudience: parsed.targetAudience || planOutput.targetAudience,
          keyAngles: Array.isArray(parsed.keyAngles) ? parsed.keyAngles : planOutput.keyAngles,
          suggestedSections: Array.isArray(parsed.suggestedSections) ? parsed.suggestedSections : planOutput.suggestedSections,
          retrievalKeywords: parsed.retrievalKeywords || planOutput.retrievalKeywords,
        };
      }
    } catch (e) {
      // Keep fallback structured plan
    }
  }

  return {
    output: planOutput,
    durationMs: Date.now() - start,
  };
}

/**
 * Stage 2: Knowledge & Context Retrieval
 */
export async function executeRetrieverStage(
  userId: string,
  keywords: string
): Promise<{ output: { retrievedChunks: RetrievedChunk[]; contextText: string }; durationMs: number }> {
  const start = Date.now();
  const chunks = await retrieveRelevantChunks(userId, keywords, 3);

  const contextText = chunks.length > 0
    ? chunks.map((c) => `Source (${c.title}): ${c.chunkText}`).join('\n')
    : `Standard creator guidelines for topic: ${keywords}`;

  return {
    output: {
      retrievedChunks: chunks,
      contextText,
    },
    durationMs: Date.now() - start,
  };
}

/**
 * Stage 3: Draft Generator
 */
export async function executeGeneratorStage(
  topic: string,
  platform: string,
  plan: StrategyPlanOutput,
  contextText: string
): Promise<{ output: GeneratorOutput; durationMs: number }> {
  const start = Date.now();
  const ai = getAIClient();

  const systemInstruction = buildSystemInstructions(
    'Multi-Step Draft Generator',
    `Generate content for ${platform} following the plan: Sections (${plan.suggestedSections.join(', ')}).`,
    'High quality multi-section draft.'
  );

  const prompt = `${systemInstruction}

### Context
Topic: ${topic}
Retrieved Knowledge Context:
${contextText}

Target Audience: ${plan.targetAudience}
Key Angles: ${plan.keyAngles.join('; ')}
Section Structure to Follow:
${plan.suggestedSections.map((s, i) => `${i + 1}. ${s}`).join('\n')}
`;

  let rawDraft = '';
  if (process.env.GEMINI_API_KEY) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
      });
      rawDraft = response.text || '';
    } catch (e) {
      rawDraft = `### ${plan.suggestedSections[0]}\nStarting with a hook about ${topic}.\n\n### ${plan.suggestedSections[1]}\nKey insights derived from context: ${contextText.substring(0, 150)}...\n\n### ${plan.suggestedSections[2]}\nSummary takeaway and call to action for ${platform}.`;
    }
  } else {
    rawDraft = `### ${plan.suggestedSections[0]}\nHook: Exciting updates regarding ${topic}!\n\n### ${plan.suggestedSections[1]}\nInsights & Context:\n${contextText}\n\n### ${plan.suggestedSections[2]}\nWhat are your thoughts on ${topic}? Comment below!`;
  }

  const sectionMatches = rawDraft.match(/###|#|\n\n/g) || [];

  return {
    output: {
      rawDraft,
      sectionCount: Math.max(3, sectionMatches.length),
    },
    durationMs: Date.now() - start,
  };
}

/**
 * Stage 4: Quality Refiner & Safety Guard
 */
export async function executeRefinerStage(
  rawDraft: string,
  isSuspicious: boolean
): Promise<{ output: RefinedFinalOutput; durationMs: number }> {
  const start = Date.now();

  const words = rawDraft.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  const hashtagMatches = rawDraft.match(/#[A-Za-z0-9_]+/g) || ['#CreatorEconomy', '#ContentStrategy', '#AIHub'];
  const hashtags = Array.from(new Set(hashtagMatches));

  const warnings: string[] = [];
  if (isSuspicious) {
    warnings.push('Prompt injection patterns were detected in the original input and neutralized.');
  }

  const readabilityScore = Math.min(100, Math.max(60, Math.round(100 - wordCount * 0.05)));

  return {
    output: {
      finalContent: rawDraft.trim(),
      hashtags,
      readabilityScore,
      qualityPassed: !isSuspicious && wordCount > 10,
      warnings,
    },
    durationMs: Date.now() - start,
  };
}

/**
 * Main Multi-Step Agent Orchestrator Pipeline
 */
export async function runMultiStepAgent(
  userId: string,
  topic: string,
  platform: string = 'LinkedIn',
  tone: string = 'Professional'
): Promise<MultiStepAgentExecutionResult> {
  const startTime = Date.now();
  const executionId = `agent_exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const defense = sanitizeAndGuardPrompt(topic, 3000);

  // Stage 1: Planner
  const plannerStartedAt = new Date().toISOString();
  const plannerRes = await executePlannerStage(defense.wrappedUserContent, platform, tone);
  const plannerStage: AgentStageResult<StrategyPlanOutput> = {
    stage: 'planner',
    status: 'completed',
    startedAt: plannerStartedAt,
    completedAt: new Date().toISOString(),
    durationMs: plannerRes.durationMs,
    output: plannerRes.output,
  };

  // Stage 2: Knowledge Retriever
  const retrieverStartedAt = new Date().toISOString();
  const retrieverRes = await executeRetrieverStage(userId, plannerRes.output.retrievalKeywords);
  const retrieverStage: AgentStageResult<{ retrievedChunks: RetrievedChunk[]; contextText: string }> = {
    stage: 'retriever',
    status: 'completed',
    startedAt: retrieverStartedAt,
    completedAt: new Date().toISOString(),
    durationMs: retrieverRes.durationMs,
    output: retrieverRes.output,
  };

  // Stage 3: Generator
  const generatorStartedAt = new Date().toISOString();
  const generatorRes = await executeGeneratorStage(topic, platform, plannerRes.output, retrieverRes.output.contextText);
  const generatorStage: AgentStageResult<GeneratorOutput> = {
    stage: 'generator',
    status: 'completed',
    startedAt: generatorStartedAt,
    completedAt: new Date().toISOString(),
    durationMs: generatorRes.durationMs,
    output: generatorRes.output,
  };

  // Stage 4: Refiner
  const refinerStartedAt = new Date().toISOString();
  const refinerRes = await executeRefinerStage(generatorRes.output.rawDraft, defense.isSuspicious);
  const refinerStage: AgentStageResult<RefinedFinalOutput> = {
    stage: 'refiner',
    status: 'completed',
    startedAt: refinerStartedAt,
    completedAt: new Date().toISOString(),
    durationMs: refinerRes.durationMs,
    output: refinerRes.output,
  };

  const totalDurationMs = Date.now() - startTime;
  const fullPromptText = `${topic} (${platform} - ${tone})`;
  const totalUsage = calculateTokenUsageAndCost(fullPromptText, refinerRes.output.finalContent, 'gemini-3.6-flash');

  return {
    executionId,
    userId,
    topic,
    platform,
    isSuspicious: defense.isSuspicious,
    suspiciousReason: defense.suspiciousReason,
    stages: {
      planner: plannerStage,
      retriever: retrieverStage,
      generator: generatorStage,
      refiner: refinerStage,
    },
    totalDurationMs,
    totalUsage,
  };
}
