import { GoogleGenAI } from '@google/genai';
import { sanitizeAndGuardPrompt } from '../utils/promptDefense.js';
import {
  CAPTION_SYSTEM_PROMPT,
  CONTENT_DRAFT_SYSTEM_PROMPT,
  REWRITE_SYSTEM_PROMPT,
  SUMMARIZE_SYSTEM_PROMPT,
  HASHTAG_SYSTEM_PROMPT,
  ASSISTANT_SYSTEM_PROMPT,
  STREAMING_SYSTEM_PROMPT
} from '../utils/promptTemplates.js';
import { creatorToolDeclarations, executeToolCall } from './geminiTools.js';

const apiKey = process.env.GEMINI_API_KEY || '';

function getAIClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY environment variable is not configured. AI service calls will throw an error if invoked.');
  }
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'MISSING_KEY' });
}

export async function generateCaptions(
  topicOrText: string,
  tone: string = 'creative',
  platform: string = 'Instagram',
  count: number = 3
): Promise<{ captions: string[]; isSuspicious: boolean; suspiciousReason?: string }> {
  const defense = sanitizeAndGuardPrompt(topicOrText, 3000);
  const ai = getAIClient();

  const prompt = `${CAPTION_SYSTEM_PROMPT}

### Context
Target Platform: ${platform}
Requested Tone: ${tone}
Requested Caption Count: ${count}
User Content Topic:
${defense.wrappedUserContent}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: prompt,
    config: {
      temperature: 0.7,
    },
  });

  const text = response.text || '';
  // Split response by numbered lines or double line breaks into array
  const captions = text
    .split(/\n(?=\d+[\.\)]|\n)/)
    .map((c) => c.replace(/^\d+[\.\)]\s*/, '').trim())
    .filter((c) => c.length > 0);

  return {
    captions: captions.length > 0 ? captions : [text],
    isSuspicious: defense.isSuspicious,
    suspiciousReason: defense.suspiciousReason,
  };
}

export async function generateContentDraft(
  topic: string,
  category: string,
  platform: string,
  additionalInstructions?: string
): Promise<{ draft: string; isSuspicious: boolean; suspiciousReason?: string }> {
  const defense = sanitizeAndGuardPrompt(
    `${topic} ${additionalInstructions ? '\n' + additionalInstructions : ''}`,
    4000
  );
  const ai = getAIClient();

  const prompt = `${CONTENT_DRAFT_SYSTEM_PROMPT}

### Context
Category: ${category}
Platform: ${platform}
Topic Details:
${defense.wrappedUserContent}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: prompt,
    config: {
      temperature: 0.7,
    },
  });

  return {
    draft: response.text || 'Unable to generate content draft.',
    isSuspicious: defense.isSuspicious,
    suspiciousReason: defense.suspiciousReason,
  };
}

export async function rewriteContent(
  content: string,
  targetTone: string,
  goal: string = 'change_tone'
): Promise<{ rewritten: string; isSuspicious: boolean; suspiciousReason?: string }> {
  const defense = sanitizeAndGuardPrompt(content, 5000);
  const ai = getAIClient();

  const prompt = `${REWRITE_SYSTEM_PROMPT}

### Context
Goal: ${goal}
Target Tone: ${targetTone}
Original Text:
${defense.wrappedUserContent}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: prompt,
    config: {
      temperature: 0.6,
    },
  });

  return {
    rewritten: response.text || '',
    isSuspicious: defense.isSuspicious,
    suspiciousReason: defense.suspiciousReason,
  };
}

export async function summarizeContent(
  content: string,
  format: 'bullet_points' | 'paragraph' | 'one_liner' = 'bullet_points'
): Promise<{ summary: string; isSuspicious: boolean; suspiciousReason?: string }> {
  const defense = sanitizeAndGuardPrompt(content, 8000);
  const ai = getAIClient();

  const prompt = `${SUMMARIZE_SYSTEM_PROMPT}

### Context
Desired Format: ${format}
Original Content:
${defense.wrappedUserContent}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: prompt,
  });

  return {
    summary: response.text || '',
    isSuspicious: defense.isSuspicious,
    suspiciousReason: defense.suspiciousReason,
  };
}

export async function generateHashtags(
  topic: string,
  niche: string = 'General',
  count: number = 15
): Promise<{ hashtags: string[]; isSuspicious: boolean; suspiciousReason?: string }> {
  const defense = sanitizeAndGuardPrompt(topic, 1000);
  const ai = getAIClient();

  const prompt = `${HASHTAG_SYSTEM_PROMPT}

### Context
Niche: ${niche}
Target Count: ${count}
Topic:
${defense.wrappedUserContent}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: prompt,
  });

  const rawText = response.text || '';
  const hashtagMatches = rawText.match(/#[A-Za-z0-9_]+/g) || [];

  return {
    hashtags: hashtagMatches.length > 0 ? Array.from(new Set(hashtagMatches)) : [rawText],
    isSuspicious: defense.isSuspicious,
    suspiciousReason: defense.suspiciousReason,
  };
}

export async function runAssistantToolChat(
  userId: string,
  message: string
): Promise<{ reply: string; toolCallsCount: number; isSuspicious: boolean; suspiciousReason?: string }> {
  const defense = sanitizeAndGuardPrompt(message, 2000);
  const ai = getAIClient();

  const prompt = `${ASSISTANT_SYSTEM_PROMPT}\n\n### Context\nUser Query:\n${defense.wrappedUserContent}`;

  let toolCallsCount = 0;

  // Initial call with Function Declarations
  const initialResponse = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: prompt,
    config: {
      tools: [{ functionDeclarations: creatorToolDeclarations }],
    },
  });

  // Check if Gemini invoked function calls
  const functionCalls = initialResponse.functionCalls;

  if (functionCalls && functionCalls.length > 0) {
    toolCallsCount = functionCalls.length;
    const call = functionCalls[0];
    const toolResult = await executeToolCall(userId, call.name, call.args);

    // Provide tool result back to Gemini for final response synthesis
    const followUpPrompt = [
      { role: 'user', parts: [{ text: prompt }] },
      { role: 'model', parts: initialResponse.candidates?.[0]?.content?.parts || [] },
      {
        role: 'user',
        parts: [
          {
            text: `Tool Execution Result for '${call.name}':\n${JSON.stringify(toolResult, null, 2)}\n\nPlease synthesize this tool response into a friendly, professional answer for the creator.`,
          },
        ],
      },
    ];

    const finalResponse = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: followUpPrompt as any,
    });

    return {
      reply: finalResponse.text || 'Processed tool response successfully.',
      toolCallsCount,
      isSuspicious: defense.isSuspicious,
      suspiciousReason: defense.suspiciousReason,
    };
  }

  return {
    reply: initialResponse.text || 'I am ready to help you manage your content.',
    toolCallsCount: 0,
    isSuspicious: defense.isSuspicious,
    suspiciousReason: defense.suspiciousReason,
  };
}

export async function generateContentStream(
  promptText: string,
  onChunk: (chunkText: string) => void
): Promise<{ fullText: string; isSuspicious: boolean; suspiciousReason?: string }> {
  const defense = sanitizeAndGuardPrompt(promptText, 4000);
  const ai = getAIClient();

  const prompt = `${STREAMING_SYSTEM_PROMPT}\n\n### Context\nUser Prompt:\n${defense.wrappedUserContent}`;

  let fullText = '';
  if (process.env.GEMINI_API_KEY) {
    try {
      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: { temperature: 0.7 },
      });

      for await (const chunk of responseStream) {
        const chunkText = chunk.text || '';
        if (chunkText) {
          fullText += chunkText;
          onChunk(chunkText);
        }
      }
    } catch (e) {
      console.warn('Gemini stream API error:', (e as Error).message);
      fullText = 'Unable to complete streaming request.';
      onChunk(fullText);
    }
  } else {
    // Offline/Test streaming simulation chunking
    const mockChunks = [
      '### Content Draft\n',
      'Here is your requested content, ',
      'generated progressively using streaming. ',
      'Enjoy seamless real-time output!',
    ];
    for (const chunkText of mockChunks) {
      fullText += chunkText;
      onChunk(chunkText);
    }
  }

  return {
    fullText,
    isSuspicious: defense.isSuspicious,
    suspiciousReason: defense.suspiciousReason,
  };
}

