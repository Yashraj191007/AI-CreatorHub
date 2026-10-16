import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { app } from '../../app.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup.js';
import fs from 'fs';
import path from 'path';

let authToken: string;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await clearTestDB();

  // Create a test user and obtain auth token
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Media Creator',
      email: 'creator_media@example.com',
      password: 'password123',
    });
  authToken = res.body.token;
});

describe('Media File Upload API Endpoints', () => {
  it('should reject unauthenticated upload requests with 401', async () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const res = await request(app)
      .post('/api/media/upload')
      .attach('file', pngBuffer, { filename: 'avatar.png', contentType: 'image/png' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should successfully upload a valid image file and return metadata', async () => {
    // Valid PNG signature header
    const validPngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);

    const res = await request(app)
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', validPngBuffer, { filename: 'test-banner.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.media).toBeDefined();
    expect(res.body.media.filename).toContain('.png');
    expect(res.body.media.url).toContain('/uploads/');
    expect(res.body.media.mimeType).toBe('image/png');

    // Clean up created test file on disk
    const savedPath = path.join(process.cwd(), 'uploads', res.body.media.filename);
    if (fs.existsSync(savedPath)) {
      fs.unlinkSync(savedPath);
    }
  });

  it('should reject upload if file extension is not an allowed image format', async () => {
    const textBuffer = Buffer.from('console.log("malicious executable payload");');

    const res = await request(app)
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', textBuffer, { filename: 'malware.exe', contentType: 'application/x-msdownload' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Invalid file type/i);
  });

  it('should reject MIME-spoofed upload when extension is .png but magic bytes are invalid text', async () => {
    // Client supplies image/png and .png filename, but body is pure ASCII text
    const spoofedBuffer = Buffer.from('This is a spoofed text file trying to bypass MIME checks');

    const res = await request(app)
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', spoofedBuffer, { filename: 'spoofed_photo.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('File signature verification failed');
  });

  it('should return 400 when no file is attached in the request', async () => {
    const res = await request(app)
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('No media file provided');
  });

  it('should reject oversized file exceeding the 5MB limit', async () => {
    // 5MB + 1KB buffer
    const oversizedBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024);
    // Write valid PNG header so signature check would pass if it got that far
    oversizedBuffer[0] = 0x89;
    oversizedBuffer[1] = 0x50;
    oversizedBuffer[2] = 0x4e;
    oversizedBuffer[3] = 0x47;

    const res = await request(app)
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', oversizedBuffer, { filename: 'huge_photo.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/exceeds maximum permitted limit/i);
  });

  it('should fetch user media items successfully via GET /api/media', async () => {
    const validJpgBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

    const uploadRes = await request(app)
      .post('/api/media/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', validJpgBuffer, { filename: 'cover.jpg', contentType: 'image/jpeg' });

    expect(uploadRes.status).toBe(201);

    const getRes = await request(app)
      .get('/api/media')
      .set('Authorization', `Bearer ${authToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    expect(Array.isArray(getRes.body.media)).toBe(true);
    expect(getRes.body.media.length).toBe(1);
    expect(getRes.body.media[0].originalName).toBe('cover.jpg');

    // Cleanup file
    const savedPath = path.join(process.cwd(), 'uploads', uploadRes.body.media.filename);
    if (fs.existsSync(savedPath)) {
      fs.unlinkSync(savedPath);
    }
  });
});
