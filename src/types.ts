export type Role = 'USER' | 'ADMIN';
export type UserStatus = 'active' | 'disabled';
export type ContentCategory = 'Social Media' | 'Blog Post' | 'Video Script' | 'Newsletter' | 'Ad Copy' | 'Other';
export type ContentStatus = 'draft' | 'published';
export type Platform = 'Instagram' | 'YouTube' | 'X/Twitter' | 'LinkedIn' | 'TikTok' | 'Blog' | 'General';

export interface User {
  id: string;
  _id?: string;
  name: string;
  email: string;
  role: Role;
  status?: UserStatus;
  bio?: string;
  avatar?: string;
  authProvider?: 'local' | 'google' | 'github';
  googleId?: string;
  socialHandles?: {
    twitter?: string;
    instagram?: string;
    youtube?: string;
    linkedin?: string;
  };
  contentCount?: number;
  createdAt: string;
}

export interface ContentItem {
  _id: string;
  userId: string | User;
  title: string;
  body: string;
  category: ContentCategory;
  tags: string[];
  status: ContentStatus;
  platform: Platform;
  mediaUrl?: string;
  aiCaptions?: string[];
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaItem {
  _id: string;
  userId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: string;
}

export interface AIRequestItem {
  _id: string;
  operationType: string;
  prompt: string;
  result?: string;
  isSuspicious: boolean;
  suspiciousReason?: string;
  toolCallsCount: number;
  createdAt: string;
}

export interface DashboardStats {
  totalContent: number;
  publishedContent: number;
  draftContent: number;
  categoryBreakdown: Array<{ _id: string; count: number }>;
  recentContent: ContentItem[];
}

export interface PlatformStats {
  totalUsers: number;
  totalContent: number;
  publishedContent: number;
  draftContent: number;
  totalAIRequests: number;
  suspiciousAIRequests: number;
  aiOperationStats: Array<{ _id: string; count: number }>;
}
