/**
 * Token & Cost Monitoring Utility for AI-CreatorHub
 * Calculates estimated LLM monetary costs (USD) based on prompt and completion token counts
 * using configurable model pricing rates.
 */

export interface ModelPricing {
  modelName: string;
  costPer1kPromptTokens: number; // Cost in USD per 1,000 prompt tokens
  costPer1kCandidateTokens: number; // Cost in USD per 1,000 candidate tokens
}

export interface UsageCalculationResult {
  promptTokens: number;
  candidateTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
}

// Configurable pricing rates (per 1,000 tokens)
// Default rates based on Gemini 1.5/3.6 Flash pricing ($0.075 / 1M prompt, $0.30 / 1M output)
const DEFAULT_MODEL_PRICING: Record<string, ModelPricing> = {
  'gemini-3.6-flash': {
    modelName: 'gemini-3.6-flash',
    costPer1kPromptTokens: Number(process.env.GEMINI_FLASH_INPUT_COST_PER_1K) || 0.000075,
    costPer1kCandidateTokens: Number(process.env.GEMINI_FLASH_OUTPUT_COST_PER_1K) || 0.0003,
  },
  'gemini-1.5-flash': {
    modelName: 'gemini-1.5-flash',
    costPer1kPromptTokens: 0.000075,
    costPer1kCandidateTokens: 0.0003,
  },
  'text-embedding-004': {
    modelName: 'text-embedding-004',
    costPer1kPromptTokens: 0.000025,
    costPer1kCandidateTokens: 0,
  },
};

/**
 * Calculates token usage and estimated cost in USD for a given model call.
 * If actual token counts are not provided by metadata, estimates from character count (1 token ~= 4 chars).
 */
export function calculateTokenUsageAndCost(
  prompt: string,
  resultText: string,
  modelName: string = 'gemini-3.6-flash',
  actualUsageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }
): UsageCalculationResult {
  let promptTokens = actualUsageMetadata?.promptTokenCount;
  let candidateTokens = actualUsageMetadata?.candidatesTokenCount;

  // Fallback token estimation if provider metadata is absent (1 token ~ 4 characters)
  if (promptTokens === undefined || promptTokens === null) {
    promptTokens = Math.max(1, Math.ceil(prompt.length / 4));
  }
  if (candidateTokens === undefined || candidateTokens === null) {
    candidateTokens = Math.max(1, Math.ceil(resultText.length / 4));
  }

  const totalTokens = actualUsageMetadata?.totalTokenCount || promptTokens + candidateTokens;

  const pricing = DEFAULT_MODEL_PRICING[modelName] || DEFAULT_MODEL_PRICING['gemini-3.6-flash'];

  const promptCost = (promptTokens / 1000) * pricing.costPer1kPromptTokens;
  const candidateCost = (candidateTokens / 1000) * pricing.costPer1kCandidateTokens;
  const estimatedCostUSD = Number((promptCost + candidateCost).toFixed(8));

  return {
    promptTokens,
    candidateTokens,
    totalTokens,
    estimatedCostUSD,
  };
}

export interface UsageStatsSummary {
  totalRequests: number;
  totalPromptTokens: number;
  totalCandidateTokens: number;
  totalTokens: number;
  totalCostUSD: number;
}

/**
 * Helper to aggregate usage across multiple AI requests.
 */
export function aggregateUsageStats(
  requests: Array<{ promptTokens?: number; candidateTokens?: number; totalTokens?: number; estimatedCostUSD?: number }>
): UsageStatsSummary {
  const initial: UsageStatsSummary = {
    totalRequests: 0,
    totalPromptTokens: 0,
    totalCandidateTokens: 0,
    totalTokens: 0,
    totalCostUSD: 0,
  };
  return requests.reduce(
    (acc: UsageStatsSummary, req) => {
      acc.totalRequests += 1;
      acc.totalPromptTokens += req.promptTokens || 0;
      acc.totalCandidateTokens += req.candidateTokens || 0;
      acc.totalTokens += req.totalTokens || 0;
      acc.totalCostUSD = Number((acc.totalCostUSD + (req.estimatedCostUSD || 0)).toFixed(8));
      return acc;
    },
    initial
  );
}

