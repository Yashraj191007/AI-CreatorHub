import { describe, it, expect, beforeEach } from 'vitest';
import {
  cosineSimilarity,
  chunkText,
  generateEmbedding,
  indexKnowledgeDocument,
  retrieveRelevantChunks,
} from '../../services/ragService.js';
import { KnowledgeDoc } from '../../models/KnowledgeDoc.js';
import mongoose from 'mongoose';

describe('RAG Service (Embeddings & Vector Retrieval)', () => {
  it('should split long text into overlapping chunks', () => {
    const text = Array(500).fill('content').join(' ');
    const chunks = chunkText(text, 100, 20);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].split(/\s+/).length).toBe(100);
  });

  it('should compute exact cosine similarity between vector arrays', () => {
    const vecA = [1, 0, 0];
    const vecB = [1, 0, 0];
    const vecC = [0, 1, 0];
    const vecD = [-1, 0, 0];

    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0);
    expect(cosineSimilarity(vecA, vecC)).toBeCloseTo(0.0);
    expect(cosineSimilarity(vecA, vecD)).toBeCloseTo(-1.0);
  });

  it('should generate normalized embedding vectors', async () => {
    const text = 'Artificial Intelligence content creator workflow';
    const embedding = await generateEmbedding(text);

    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBeGreaterThan(0);

    // Magnitude should be ~1.0 for unit normalized vector
    const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 2);
  });
});
