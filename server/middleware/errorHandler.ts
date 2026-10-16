import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export interface CustomError extends Error {
  statusCode?: number;
  code?: number;
}

export function errorHandler(
  err: CustomError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let details: any = null;

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    statusCode = 422;
    message = 'Validation Error';
    details = err.issues.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
  }

  // Handle Mongoose Duplicate Key Error
  if (err.code === 11000) {
    statusCode = 409;
    message = 'Duplicate field value entered. Record already exists.';
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Resource not found or invalid ID format.';
  }

  // Handle Multer upload errors (e.g. fileSize limit, invalid file type)
  if (err.name === 'MulterError' || (err as any).code === 'LIMIT_FILE_SIZE') {
    statusCode = 400;
    if ((err as any).code === 'LIMIT_FILE_SIZE') {
      message = 'File size exceeds maximum permitted limit (5MB)';
    } else {
      message = `File upload error: ${err.message}`;
    }
  }

  if (err.message && err.message.startsWith('Invalid file type')) {
    statusCode = 400;
    message = err.message;
  }

  if (process.env.NODE_ENV !== 'production' && statusCode === 500) {
    console.error('SERVER ERROR STACK:', err);
  } else if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    // Sanitize production 500 error responses to prevent leaking internal database, path, or API details
    message = 'Internal Server Error';
    details = null;
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    details,
  });
}
