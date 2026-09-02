import { GoogleGenAI } from '@google/genai';
import { KnowledgeDoc, IKnowledgeDoc } from '../models/KnowledgeDoc.js';
import { sanitizeAndGuardPrompt } from '../utils/promptDefense.js';
import { RAG_SYSTEM_PROMPT } from '../utils/promptTemplates.js';
import { calculateTokenUsageAndCost, UsageCalculationResult } from '../utils/costMonitor.js';

function getAIClient(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'MISSING_KEY' });
}

/**
 * Calculates cosine similarity between two vector arrays.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Splits document text into overlapping text chunks for vector indexing.
 */
export function chunkText(text: string, chunkSize: number = 300, overlap: number = 50): string[] {
  if (!text || text.trim().length === 0) return [];
  const words = text.trim().split(/\s+/);
  if (words.length <= chunkSize) {
    return [text.trim()];
  }
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    chunks.push(chunk);
    i += chunkSize - overlap;
  }
  return chunks;
}

/**
 * Generates vector embedding for text using Google GenAI or deterministic vector fallback.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = getAIClient();
      const response = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: text,
      });
      const values = (response as any).embedding?.values || (response as any).embeddings?.[0]?.values;
      if (values) {
        return values;
      }

    } catch (err) {
      console.warn('Gemini embedding API call failed, using fallback vector generator:', (err as Error).message);
    }
  }

  // Fallback vector embedding generator (64-dimensional normalized TF-IDF feature hash)
  const dim = 64;
  const vec = new Array(dim).fill(0);
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
  words.forEach((word) => {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = (hash << 5) - hash + word.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % dim;
    vec[idx] += 1;
  });

  const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return vec;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

/**
 * Indexes a document for a user by chunking and embedding each chunk in the vector store.
 */
export async function indexKnowledgeDocument(
  userId: string,
  title: string,
  content: string,
  category: string = 'General'
): Promise<{ indexedChunksCount: number }> {
  const chunks = chunkText(content);
  let indexedCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await generateEmbedding(chunk);

    await KnowledgeDoc.create({
      userId,
      title,
      category,
      content,
      chunkText: chunk,
      chunkIndex: i,
      embedding,
    });
    indexedCount++;
  }

  return { indexedChunksCount: indexedCount };
}

export interface RetrievedChunk {
  docId: string;
  title: string;
  category: string;
  chunkText: string;
  similarityScore: number;
}

/**
 * Vector similarity search to retrieve top-K relevant chunks matching a query vector.
 */
import mongoose from 'mongoose';

export async function retrieveRelevantChunks(
  userId: string,
  queryText: string,
  topK: number = 3
): Promise<RetrievedChunk[]> {
  const queryVec = await generateEmbedding(queryText);
  let docs: IKnowledgeDoc[] = [];
  if (mongoose.connection.readyState === 1) {
    try {
      docs = await KnowledgeDoc.find({ userId });
    } catch (e) {
      docs = [];
    }
  }

  const scoredDocs = docs.map((doc) => {
    const score = cosineSimilarity(queryVec, doc.embedding);
    return {
      docId: doc._id.toString(),
      title: doc.title,
      category: doc.category,
      chunkText: doc.chunkText,
      similarityScore: Number(score.toFixed(4)),
    };
  });

  scoredDocs.sort((a, b) => b.similarityScore - a.similarityScore);
  return scoredDocs.slice(0, topK);
}


/**
 * RAG-Augmented response generation using retrieved knowledge context.
 */
export async function generateRAGAugmentedResponse(
  userId: string,
  query: string,
  topK: number = 3
): Promise<{
  reply: string;
  retrievedContext: RetrievedChunk[];
  isSuspicious: boolean;
  suspiciousReason?: string;
  usage: UsageCalculationResult;
}> {
  const defense = sanitizeAndGuardPrompt(query, 3000);
  const chunks = await retrieveRelevantChunks(userId, query, topK);

  const contextBlock = chunks.length > 0
    ? chunks.map((c, i) => `[Source ${i + 1}: ${c.title} (${(c.similarityScore * 100).toFixed(1)}% match)]\n${c.chunkText}`).join('\n\n')
    : 'No relevant vector knowledge base context found.';

  const ai = getAIClient();
  const prompt = `${RAG_SYSTEM_PROMPT}

### Context
Retrieved Vector Context:
${contextBlock}

User Question:
${defense.wrappedUserContent}`;

  let replyText = '';
  if (process.env.GEMINI_API_KEY) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
      });
      replyText = response.text || '';
    } catch (e) {
      replyText = `Synthesized answer based on retrieved context (${chunks.length} sources matched): ${contextBlock.substring(0, 300)}...`;
    }
  } else {
    replyText = `Synthesized RAG Answer based on ${chunks.length} retrieved knowledge chunks:\n\n` +
      (chunks.length > 0
        ? `Based on "${chunks[0].title}": ${chunks[0].chunkText}`
        : `No matching background context retrieved for query: "${query}".`);
  }

  const usage = calculateTokenUsageAndCost(prompt, replyText, 'gemini-3.6-flash');

  return {
    reply: replyText,
    retrievedContext: chunks,
    isSuspicious: defense.isSuspicious,
    suspiciousReason: defense.suspiciousReason,
    usage,
  };
}
