import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { app } from '../../app.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup.js';
import { User } from '../../models/User.js';

let authToken: string;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  
  // Register a user to get a valid token
  const res = await request(app).post('/api/auth/register').send({
    name: 'Content Creator',
    email: 'creator@example.com',
    password: 'password123'
  });
  authToken = res.body.token;
});

describe('Content API Endpoints', () => {
  it('should reject unauthenticated requests to GET /api/content', async () => {
    const res = await request(app).get('/api/content');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should allow authenticated GET /api/content', async () => {
    const res = await request(app)
      .get('/api/content')
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.contents).toBeInstanceOf(Array);
  });

  it('should create new content successfully', async () => {
    const res = await request(app)
      .post('/api/content')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'New Integration Test Post',
        body: 'Testing content creation.',
        category: 'Blog Post',
        status: 'draft'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.content.title).toBe('New Integration Test Post');
  });

  it('should fail creation with invalid data (Zod validation)', async () => {
    const res = await request(app)
      .post('/api/content')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: '', // Invalid empty title
        body: 'Testing validation.'
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Validation Error');
  });

  it('should retrieve a single content item by ID (READ)', async () => {
    const createRes = await request(app)
      .post('/api/content')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Single Content Item',
        body: 'Body for single item lookup.',
        category: 'Social Media',
        status: 'draft'
      });

    const contentId = createRes.body.content._id;

    const getRes = await request(app)
      .get(`/api/content/${contentId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    expect(getRes.body.content._id).toBe(contentId);
    expect(getRes.body.content.title).toBe('Single Content Item');
  });

  it('should update an existing content item by ID (UPDATE)', async () => {
    const createRes = await request(app)
      .post('/api/content')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Original Title',
        body: 'Original Body',
        category: 'Blog Post',
        status: 'draft'
      });

    const contentId = createRes.body.content._id;

    const updateRes = await request(app)
      .put(`/api/content/${contentId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Updated Title',
        status: 'published'
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.success).toBe(true);
    expect(updateRes.body.content.title).toBe('Updated Title');
    expect(updateRes.body.content.status).toBe('published');
    expect(updateRes.body.content.publishedAt).toBeDefined();
  });

  it('should delete a content item by ID and confirm deletion (DELETE)', async () => {
    const createRes = await request(app)
      .post('/api/content')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Item To Be Deleted',
        body: 'Body to delete',
        category: 'Newsletter',
        status: 'draft'
      });

    const contentId = createRes.body.content._id;

    const deleteRes = await request(app)
      .delete(`/api/content/${contentId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
    expect(deleteRes.body.message).toBe('Content deleted successfully');

    // Confirm deletion with subsequent lookup
    const lookupRes = await request(app)
      .get(`/api/content/${contentId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(lookupRes.status).toBe(404);
    expect(lookupRes.body.success).toBe(false);
  });
});
