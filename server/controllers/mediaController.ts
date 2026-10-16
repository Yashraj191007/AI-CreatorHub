import { Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AuthRequest } from '../middleware/authMiddleware.js';
import { Media } from '../models/Media.js';

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Validates binary magic bytes (file signature) to ensure true file type matches image format.
 * Guards against malicious MIME-spoofing attacks (e.g. executable/script disguised as image).
 */
export function isValidImageSignature(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 4) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }
  // PNG: 89 50 4E 47 (.PNG)
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return true;
  }
  // GIF: 47 49 46 38 ('GIF8')
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return true;
  }
  // WEBP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return true;
  }

  return false;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Sanitize base name to allow only alphanumeric, hyphen, underscore
    const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '');
    const safeBaseName = baseName.slice(0, 50) || 'media';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${safeBaseName}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, and GIF images are allowed.'));
    return;
  }
  cb(null, true);
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Strict 5MB limit
});

export async function uploadMedia(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No media file provided' });
      return;
    }

    const filePath = req.file.path;

    // Verify binary magic bytes from the uploaded file
    let isValidSignature = false;
    try {
      const headerBuffer = Buffer.alloc(16);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, headerBuffer, 0, 16, 0);
      fs.closeSync(fd);
      isValidSignature = isValidImageSignature(headerBuffer);
    } catch (readErr) {
      isValidSignature = false;
    }

    if (!isValidSignature) {
      // Remove malicious or corrupted file from storage immediately
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      res.status(400).json({
        success: false,
        error: 'File signature verification failed. Uploaded content does not match allowed image format.',
      });
      return;
    }

    const userId = req.user?._id;
    const url = `/uploads/${req.file.filename}`;

    const media = await Media.create({
      userId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      url,
    });

    res.status(201).json({
      success: true,
      media: {
        id: media._id,
        filename: media.filename,
        originalName: media.originalName,
        url: media.url,
        mimeType: media.mimeType,
        size: media.size,
        createdAt: media.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getUserMedia(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?._id;
    const mediaItems = await Media.find({ userId }).sort({ createdAt: -1 });

    res.json({
      success: true,
      media: mediaItems,
    });
  } catch (error) {
    next(error);
  }
}
