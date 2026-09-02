import { describe, it, expect } from 'vitest';
import { calculateTokenUsageAndCost, aggregateUsageStats } from '../../utils/costMonitor.js';

describe('Token & Cost Monitoring Utility', () => {
  it('should calculate estimated token counts and USD cost using default Gemini Flash pricing', () => {
    const prompt = 'Generate 3 Instagram captions for a tech startup launch.';
    const resultText = '1. Launching today! 2. Say hello to innovation. 3. Future of tech is here.';

    const calc = calculateTokenUsageAndCost(prompt, resultText, 'gemini-3.6-flash');

    expect(calc.promptTokens).toBeGreaterThan(0);
    expect(calc.candidateTokens).toBeGreaterThan(0);
    expect(calc.totalTokens).toBe(calc.promptTokens + calc.candidateTokens);
    expect(calc.estimatedCostUSD).toBeGreaterThan(0);
    expect(typeof calc.estimatedCostUSD).toBe('number');
  });

  it('should prefer provider usageMetadata when supplied', () => {
    const prompt = 'Test prompt';
    const resultText = 'Test response';
    const metadata = {
      promptTokenCount: 120,
      candidatesTokenCount: 350,
      totalTokenCount: 470,
    };

    const calc = calculateTokenUsageAndCost(prompt, resultText, 'gemini-3.6-flash', metadata);

    expect(calc.promptTokens).toBe(120);
    expect(calc.candidateTokens).toBe(350);
    expect(calc.totalTokens).toBe(470);
    // Cost: (120/1000 * 0.000075) + (350/1000 * 0.0003) = 0.000009 + 0.000105 = 0.000114
    expect(calc.estimatedCostUSD).toBe(0.000114);
  });

  it('should aggregate usage stats across multiple requests', () => {
    const requests = [
      { promptTokens: 100, candidateTokens: 200, totalTokens: 300, estimatedCostUSD: 0.0001 },
      { promptTokens: 150, candidateTokens: 250, totalTokens: 400, estimatedCostUSD: 0.00015 },
    ];

    const stats = aggregateUsageStats(requests);

    expect(stats.totalRequests).toBe(2);
    expect(stats.totalPromptTokens).toBe(250);
    expect(stats.totalCandidateTokens).toBe(450);
    expect(stats.totalTokens).toBe(700);
    expect(stats.totalCostUSD).toBe(0.00025);
  });
});
