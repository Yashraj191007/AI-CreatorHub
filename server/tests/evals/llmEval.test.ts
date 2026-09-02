import { describe, it, expect } from 'vitest';
import { runLLMEvalSuite } from '../../evals/evalRunner.js';
import { EVALUATION_DATASET } from '../../evals/evalDataset.js';

describe('LLM Evaluation Benchmark Suite', () => {
  it('should run all evaluation dataset test cases and return structured metrics', async () => {
    const report = await runLLMEvalSuite(EVALUATION_DATASET);

    expect(report.totalCases).toBe(EVALUATION_DATASET.length);


    expect(report.passedCases).toBeGreaterThan(0);
    expect(report.overallScorePercentage).toBeGreaterThanOrEqual(80);
    expect(report.categoryScores.security_injection).toBeDefined();
    expect(report.categoryScores.security_injection.scorePercentage).toBe(100);
  });
});
