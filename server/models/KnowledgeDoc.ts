import mongoose, { Schema, Document } from 'mongoose';

export interface IKnowledgeDoc extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  category: string;
  content: string;
  chunkText: string;
  chunkIndex: number;
  embedding: number[];
  createdAt: Date;
}

const KnowledgeDocSchema = new Schema<IKnowledgeDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      default: 'General',
      index: true,
    },
    content: {
      type: String,
      required: true,
    },
    chunkText: {
      type: String,
      required: true,
    },
    chunkIndex: {
      type: Number,
      default: 0,
    },
    embedding: {
      type: [Number],
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

KnowledgeDocSchema.index({ userId: 1, category: 1 });

export const KnowledgeDoc = mongoose.model<IKnowledgeDoc>('KnowledgeDoc', KnowledgeDocSchema);
