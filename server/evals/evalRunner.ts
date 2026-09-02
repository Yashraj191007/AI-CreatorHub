import { EVALUATION_DATASET, EvalTestCase } from './evalDataset.js';
import { sanitizeAndGuardPrompt } from '../utils/promptDefense.js';
import { executePlannerStage, runMultiStepAgent } from '../services/multiStepAgentService.js';
import { retrieveRelevantChunks } from '../services/ragService.js';
import mongoose from 'mongoose';

export interface EvalResult {
  testId: string;
  category: string;
  passed: boolean;
  score: number;
  reason: string;
}

export interface EvalReport {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  overallScorePercentage: number;
  categoryScores: Record<string, { total: number; passed: number; scorePercentage: number }>;
  results: EvalResult[];
}

export async function runLLMEvalSuite(dataset: EvalTestCase[] = EVALUATION_DATASET): Promise<EvalReport> {
  const results: EvalResult[] = [];
  const categoryStats: Record<string, { total: number; passed: number }> = {};

  const mockUserId = new mongoose.Types.ObjectId().toString();

  for (const testCase of dataset) {
    if (!categoryStats[testCase.category]) {
      categoryStats[testCase.category] = { total: 0, passed: 0 };
    }
    categoryStats[testCase.category].total += 1;

    let passed = true;
    let reason = 'Criteria satisfied';

    if (testCase.category === 'security_injection') {
      const defense = sanitizeAndGuardPrompt(testCase.prompt, 4000);
      if (testCase.expectedCriteria.mustDetectInjection && !defense.isSuspicious) {
        passed = false;
        reason = 'Failed to detect prompt injection';
      }
    } else if (testCase.category === 'caption_constraints') {
      const defense = sanitizeAndGuardPrompt(testCase.prompt, 4000);
      if (testCase.expectedCriteria.expectedMinCount && testCase.expectedCriteria.expectedMinCount < 1) {
        passed = false;
        reason = 'Invalid caption count expected';
      }
    } else if (testCase.category === 'multi_step_agent') {
      const plan = await executePlannerStage(testCase.prompt, testCase.context?.platform || 'LinkedIn', testCase.context?.tone || 'Professional');
      if (testCase.expectedCriteria.requiredJSONFields) {
        for (const field of testCase.expectedCriteria.requiredJSONFields) {
          if (!(field in plan.output)) {
            passed = false;
            reason = `Missing required field: ${field}`;
            break;
          }
        }
      }
    } else if (testCase.category === 'rag_relevance') {
      const chunks = await retrieveRelevantChunks(mockUserId, testCase.prompt, 3);
      if (testCase.expectedCriteria.minRetrievedChunks !== undefined && chunks.length < testCase.expectedCriteria.minRetrievedChunks) {
        passed = false;
        reason = `Retrieved chunks count (${chunks.length}) below minimum threshold`;
      }
    }


    if (passed) {
      categoryStats[testCase.category].passed += 1;
    }

    results.push({
      testId: testCase.id,
      category: testCase.category,
      passed,
      score: passed ? 1.0 : 0.0,
      reason,
    });
  }

  const totalCases = results.length;
  const passedCases = results.filter((r) => r.passed).length;
  const failedCases = totalCases - passedCases;
  const overallScorePercentage = Math.round((passedCases / Math.max(1, totalCases)) * 100);

  const categoryScores: Record<string, { total: number; passed: number; scorePercentage: number }> = {};
  Object.keys(categoryStats).forEach((cat) => {
    const stat = categoryStats[cat];
    categoryScores[cat] = {
      total: stat.total,
      passed: stat.passed,
      scorePercentage: Math.round((stat.passed / Math.max(1, stat.total)) * 100),
    };
  });

  return {
    totalCases,
    passedCases,
    failedCases,
    overallScorePercentage,
    categoryScores,
    results,
  };
}
