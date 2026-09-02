import mongoose, { Schema, Document } from 'mongoose';

export interface IAIRequest extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  operationType: 'generateCaptions' | 'generateContent' | 'rewriteContent' | 'summarizeContent' | 'generateHashtags' | 'assistantToolChat' | 'multiStepAgent' | 'ragSearch' | 'streamContent';
  prompt: string;
  result?: string;
  isSuspicious: boolean;
  suspiciousReason?: string;
  toolCallsCount: number;
  promptTokens?: number;
  candidateTokens?: number;
  totalTokens?: number;
  estimatedCostUSD?: number;
  createdAt: Date;
}

const AIRequestSchema = new Schema<IAIRequest>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    operationType: {
      type: String,
      required: true,
      enum: ['generateCaptions', 'generateContent', 'rewriteContent', 'summarizeContent', 'generateHashtags', 'assistantToolChat', 'multiStepAgent', 'ragSearch', 'streamContent'],
      index: true,
    },
    prompt: {
      type: String,
      required: true,
    },
    result: {
      type: String,
    },
    isSuspicious: {
      type: Boolean,
      default: false,
      index: true,
    },
    suspiciousReason: {
      type: String,
      default: '',
    },
    toolCallsCount: {
      type: Number,
      default: 0,
    },
    promptTokens: {
      type: Number,
      default: 0,
    },
    candidateTokens: {
      type: Number,
      default: 0,
    },
    totalTokens: {
      type: Number,
      default: 0,
    },
    estimatedCostUSD: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const AIRequest = mongoose.model<IAIRequest>('AIRequest', AIRequestSchema);

