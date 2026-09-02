import { Request, Response, NextFunction } from 'express';

/**
 * Basic Input Sanitization Middleware
 * 
 * Removes dangerous HTML/script content from user-generated text in request bodies
 * to prevent Cross-Site Scripting (XSS) and other markup-based attacks.
 * This runs BEFORE validation and business logic.
 * 
 * NOTE: This is distinct from Prompt Injection Defense, which is handled
 * at the AI service level (promptDefense.ts) to protect the LLM.
 */

// Keys to ignore during sanitization (e.g., passwords, tokens)
const SENSITIVE_KEYS = new Set(['password', 'newPassword', 'oldPassword', 'token', 'refreshToken']);

/**
 * Sanitizes a single string by neutralizing common XSS vectors.
 */
function sanitizeString(str: string): string {
  if (typeof str !== 'string') return str;
  return str
    // Remove <script>...</script> tags entirely
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Neutralize 'javascript:' protocol in links
    .replace(/javascript:/gi, 'javascript_:')
    // Neutralize inline event handlers (e.g., onclick=, onerror=)
    .replace(/\bon\w+\s*=/gi, 'on_evt=');
}

/**
 * Recursively traverses objects and arrays to sanitize all string values,
 * while preserving the structure and skipping sensitive keys.
 */
export function sanitizeRequestBody(data: any, key?: string): any {
  if (data === null || data === undefined) return data;
  
  // Skip sensitive fields like passwords
  if (key && SENSITIVE_KEYS.has(key)) return data;

  if (typeof data === 'string') {
    return sanitizeString(data);
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeRequestBody(item));
  }

  if (typeof data === 'object') {
    const sanitizedObj: any = {};
    for (const k in data) {
      if (Object.prototype.hasOwnProperty.call(data, k)) {
        sanitizedObj[k] = sanitizeRequestBody(data[k], k);
      }
    }
    return sanitizedObj;
  }

  // Return numbers, booleans, etc. as-is
  return data;
}

export const inputSanitization = (req: Request, res: Response, next: NextFunction) => {
  if (req.body) {
    req.body = sanitizeRequestBody(req.body);
  }
  next();
};
