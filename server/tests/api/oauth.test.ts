import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { app } from '../../app.js';
import { connectTestDB, closeTestDB, clearTestDB } from '../setup.js';
import { User } from '../../models/User.js';
import { generateOAuthState, googleAuthClient } from '../../services/oauthService.js';
import { clearMemoryOAuthStore, storeExchangeCode, consumeExchangeCode } from '../../services/oauthStore.js';

const TEST_SECRET = process.env.JWT_SECRET || 'aicreatorhub_secure_jwt_secret_key_2026_xyz';

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await clearTestDB();
  clearMemoryOAuthStore();
  vi.restoreAllMocks();
});

describe('OAuth 2.0 Social Authentication Tests', () => {
  describe('Provider Discovery Endpoint', () => {
    it('should return OAuth providers discovery status via GET /api/auth/oauth/providers', async () => {
      const res = await request(app).get('/api/auth/oauth/providers');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.providers).toBeDefined();
      expect(res.body.providers.google).toBeDefined();
      expect(res.body.providers.google.name).toBe('Google');
      expect(typeof res.body.providers.google.configured).toBe('boolean');
    });
  });

  describe('Initiate Google OAuth Flow', () => {
    it('should return 503 when Google OAuth credentials are not configured', async () => {
      const origId = process.env.GOOGLE_CLIENT_ID;
      const origSecret = process.env.GOOGLE_CLIENT_SECRET;
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;

      try {
        const res = await request(app).get('/api/auth/google');
        expect(res.status).toBe(503);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('Google OAuth is not configured');
      } finally {
        process.env.GOOGLE_CLIENT_ID = origId;
        process.env.GOOGLE_CLIENT_SECRET = origSecret;
      }
    });

    it('should generate signed state, set httpOnly cookie, and redirect to Google consent screen', async () => {
      process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id.apps.googleusercontent.com';
      process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret';

      const res = await request(app).get('/api/auth/google');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBeDefined();
      expect(res.headers.location).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(res.headers.location).toContain('client_id=mock-google-client-id.apps.googleusercontent.com');
      expect(res.headers.location).toContain('scope=openid+email+profile');
      expect(res.headers.location).toContain('state=');

      // Check CSRF protection cookie attributes
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const cookieArr = Array.isArray(cookies) ? cookies : [cookies as string];
      const stateCookie = cookieArr.find((c) => c && c.includes('oauth_state_google'));
      expect(stateCookie).toBeDefined();
      expect(stateCookie).toContain('HttpOnly');
      expect(stateCookie).toContain('SameSite=Lax');
    });

    it('should return JSON with auth url and state token when format=json is requested', async () => {
      process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id.apps.googleusercontent.com';
      process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret';

      const res = await request(app).get('/api/auth/google?format=json');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(res.body.state).toBeDefined();
    });
  });

  describe('Open Redirect Defense', () => {
    it('should neutralize external open redirect attempts in return_to and fall back to /dashboard', async () => {
      process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id.apps.googleusercontent.com';
      process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret';

      const maliciousUrl = 'https://malicious-phishing-site.com/steal';
      const res = await request(app).get(`/api/auth/google?format=json&return_to=${encodeURIComponent(maliciousUrl)}`);

      expect(res.status).toBe(200);
      expect(res.body.state).toBeDefined();

      // Decode the generated state JWT to verify redirectUri was sanitized to /dashboard
      const decoded: any = jwt.verify(res.body.state, TEST_SECRET);
      expect(decoded.redirectUri).toBe('/dashboard');
      expect(decoded.redirectUri).not.toContain('malicious-phishing-site.com');
    });

    it('should neutralize protocol-relative // URLs and backslashes in redirect destination', async () => {
      process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id.apps.googleusercontent.com';
      process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret';

      const res = await request(app).get('/api/auth/google?format=json&return_to=//evil.com');
      const decoded: any = jwt.verify(res.body.state, TEST_SECRET);
      expect(decoded.redirectUri).toBe('/dashboard');
    });

    it('should preserve valid internal relative application paths in redirect destination', async () => {
      process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id.apps.googleusercontent.com';
      process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret';

      const safePath = '/content/edit/abc-123';
      const res = await request(app).get(`/api/auth/google?format=json&return_to=${encodeURIComponent(safePath)}`);
      const decoded: any = jwt.verify(res.body.state, TEST_SECRET);
      expect(decoded.redirectUri).toBe(safePath);
    });
  });

  describe('OAuth State, CSRF & Replay Prevention', () => {
    it('should reject callback requests missing the state parameter (400)', async () => {
      const res = await request(app)
        .get('/api/auth/google/callback?code=mock_code_123&format=json');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('OAuth state parameter missing');
    });

    it('should reject callback requests with an invalid or tampered state signature (400)', async () => {
      const tamperedState = 'forged.jwt.state.token';

      const res = await request(app)
        .get(`/api/auth/google/callback?code=mock_code_123&state=${tamperedState}&format=json`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid OAuth state signature');
    });

    it('should reject callback requests with an expired state token (400)', async () => {
      const expiredState = jwt.sign(
        { nonce: '123', provider: 'google', createdAt: Date.now() - 3600000 },
        TEST_SECRET,
        { expiresIn: '-10m' }
      );

      const res = await request(app)
        .get(`/api/auth/google/callback?code=mock_code_123&state=${expiredState}&format=json`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('OAuth state has expired');
    });

    it('should reject callback requests where state nonce does not match cookie nonce (400)', async () => {
      const { stateToken } = generateOAuthState('google');

      const res = await request(app)
        .get(`/api/auth/google/callback?code=mock_code_123&state=${stateToken}&format=json`)
        .set('Cookie', ['oauth_state_google=tampered_mismatched_nonce']);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('CSRF validation failed: state nonce does not match cookie nonce');
    });

    it('should prevent state replay by strictly consuming state nonce once', async () => {
      process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret';

      const { stateToken, nonce } = generateOAuthState('google');

      vi.spyOn(axios, 'post').mockResolvedValue({
        data: { access_token: 'mock_token_replay_test' },
      });
      vi.spyOn(axios, 'get').mockResolvedValue({
        data: {
          sub: 'google_user_replay',
          email: 'replay_user@example.com',
          email_verified: true,
          name: 'Replay User',
        },
      });

      // 1st callback invocation with stateToken -> Succeeds
      const firstRes = await request(app)
        .get(`/api/auth/google/callback?code=code_1&state=${stateToken}&format=json`)
        .set('Cookie', [`oauth_state_google=${nonce}`]);
      expect(firstRes.status).toBe(200);

      // 2nd callback invocation with the SAME stateToken -> Rejected with 400 (Replay Detected)
      const replayRes = await request(app)
        .get(`/api/auth/google/callback?code=code_2&state=${stateToken}&format=json`)
        .set('Cookie', [`oauth_state_google=${nonce}`]);
      expect(replayRes.status).toBe(400);
      expect(replayRes.body.success).toBe(false);
      expect(replayRes.body.error).toContain('replay detected');
    });

    it('should handle user cancellation or access denied error from Google gracefully', async () => {
      const res = await request(app)
        .get('/api/auth/google/callback?error=access_denied&error_description=User%20canceled%20login&format=json');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('User canceled login');
    });
  });

  describe('Identity Verification & Code Exchange', () => {
    it('should reject callback requests missing the authorization code (400)', async () => {
      const { stateToken, nonce } = generateOAuthState('google');

      const res = await request(app)
        .get(`/api/auth/google/callback?state=${stateToken}&format=json`)
        .set('Cookie', [`oauth_state_google=${nonce}`]);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Authorization code is missing');
    });

    it('should reject unverified Google emails (email_verified: false) to prevent account takeover', async () => {
      process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret';

      const { stateToken, nonce } = generateOAuthState('google');

      vi.spyOn(axios, 'post').mockResolvedValueOnce({
        data: { access_token: 'mock_access_token_123' },
      });

      vi.spyOn(axios, 'get').mockResolvedValueOnce({
        data: {
          sub: 'google_id_unverified',
          email: 'unverified_person@example.com',
          email_verified: false,
          name: 'Unverified Person',
        },
      });

      const res = await request(app)
        .get(`/api/auth/google/callback?code=valid_code&state=${stateToken}&format=json`)
        .set('Cookie', [`oauth_state_google=${nonce}`]);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Google account email is not verified');
    });

    it('should validate Google ID token audience, issuer, and claims when id_token is provided', async () => {
      process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret';

      const { stateToken, nonce } = generateOAuthState('google');

      vi.spyOn(axios, 'post').mockResolvedValueOnce({
        data: {
          access_token: 'mock_access_token_with_id_token',
          id_token: 'mock_raw_jwt_id_token',
        },
      });

      // Spy on googleAuthClient.verifyIdToken to simulate verified ID token claims
      vi.spyOn(googleAuthClient, 'verifyIdToken').mockResolvedValueOnce({
        getPayload: () => ({
          sub: 'google_sub_verified_by_id_token',
          email: 'verified_id_token@example.com',
          email_verified: true,
          name: 'ID Token Verified User',
          picture: 'https://lh3.googleusercontent.com/id_token_pic.jpg',
          iss: 'https://accounts.google.com',
          aud: 'mock-google-client-id',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      } as any);

      const res = await request(app)
        .get(`/api/auth/google/callback?code=id_token_code&state=${stateToken}&format=json`)
        .set('Cookie', [`oauth_state_google=${nonce}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('verified_id_token@example.com');
      expect(res.body.user.name).toBe('ID Token Verified User');
    });

    it('should reject authentication when Google ID token fails cryptographic verification (400)', async () => {
      process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret';

      const { stateToken, nonce } = generateOAuthState('google');

      vi.spyOn(axios, 'post').mockResolvedValueOnce({
        data: {
          access_token: 'mock_access_token',
          id_token: 'tampered_forged_id_token',
        },
      });

      vi.spyOn(googleAuthClient, 'verifyIdToken').mockRejectedValueOnce(
        new Error('Invalid token signature')
      );

      const res = await request(app)
        .get(`/api/auth/google/callback?code=bad_sig_code&state=${stateToken}&format=json`)
        .set('Cookie', [`oauth_state_google=${nonce}`]);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid token signature');
    });
  });

  describe('JWT Delivery Security & Single-Use Exchange Code', () => {
    it('should NEVER put application JWT in the URL query string on browser redirect', async () => {
      process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret';

      const { stateToken, nonce } = generateOAuthState('google', '/content');

      vi.spyOn(axios, 'post').mockResolvedValueOnce({
        data: { access_token: 'mock_browser_token' },
      });

      vi.spyOn(axios, 'get').mockResolvedValueOnce({
        data: {
          sub: 'google_browser_user_888',
          email: 'browser_safe@example.com',
          email_verified: true,
          name: 'Browser User',
        },
      });

      const res = await request(app)
        .get(`/api/auth/google/callback?code=browser_code&state=${stateToken}`)
        .set('Accept', 'text/html')
        .set('Cookie', [`oauth_state_google=${nonce}`]);

      expect(res.status).toBe(302);
      const redirectLocation = res.headers.location;
      expect(redirectLocation).toBeDefined();

      // CRITICAL SECURITY ASSERTION: No application JWT in URL
      expect(redirectLocation).not.toContain('oauth_token=');
      expect(redirectLocation).not.toContain('Bearer');
      expect(redirectLocation).not.toContain('jwt');
      expect(redirectLocation).not.toContain('browser_safe@example.com');

      // VERIFY: Contains only the short-lived exchange code and safe return path
      expect(redirectLocation).toContain('oauth_code=');
      expect(redirectLocation).toContain('return_to=%2Fcontent');
    });

    it('should successfully exchange a valid single-use OAuth code for application JWT and user payload', async () => {
      const exchangeCode = 'a_secure_cryptographic_exchange_code_12345';
      const mockPayload = {
        token: 'mock_signed_application_jwt_token',
        user: {
          id: 'user_123',
          name: 'Exchanged User',
          email: 'exchange@example.com',
          role: 'USER',
        },
      };

      await storeExchangeCode(exchangeCode, mockPayload, 60);

      const res = await request(app)
        .post('/api/auth/oauth/exchange-code')
        .send({ code: exchangeCode });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBe('mock_signed_application_jwt_token');
      expect(res.body.user.email).toBe('exchange@example.com');
    });

    it('should strictly reject replaying an already-consumed exchange code (single-use enforcement)', async () => {
      const exchangeCode = 'single_use_burn_test_code_99999';
      const mockPayload = {
        token: 'single_use_token',
        user: { id: 'u1', name: 'Burn User', email: 'burn@example.com', role: 'USER' },
      };

      await storeExchangeCode(exchangeCode, mockPayload, 60);

      // 1st consumption -> 200 OK
      const firstRes = await request(app)
        .post('/api/auth/oauth/exchange-code')
        .send({ code: exchangeCode });
      expect(firstRes.status).toBe(200);
      expect(firstRes.body.token).toBe('single_use_token');

      // 2nd consumption attempt -> 400 Bad Request (Already consumed)
      const secondRes = await request(app)
        .post('/api/auth/oauth/exchange-code')
        .send({ code: exchangeCode });
      expect(secondRes.status).toBe(400);
      expect(secondRes.body.success).toBe(false);
      expect(secondRes.body.error).toContain('Invalid or expired OAuth exchange code');
    });

    it('should reject expired exchange codes', async () => {
      const expiredCode = 'expired_exchange_code_00000';
      const mockPayload = {
        token: 'expired_token',
        user: { id: 'u2', name: 'Expired User', email: 'expired@example.com', role: 'USER' },
      };

      // Store with negative TTL (-1 second, immediately expired)
      await storeExchangeCode(expiredCode, mockPayload, -1);

      const res = await request(app)
        .post('/api/auth/oauth/exchange-code')
        .send({ code: expiredCode });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid or expired OAuth exchange code');
    });

    it('should reject malformed or missing exchange code format', async () => {
      const res = await request(app)
        .post('/api/auth/oauth/exchange-code')
        .send({ code: 'short' }); // under 16 characters

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should fail closed in production when Redis is disconnected during code storage', async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        await expect(
          storeExchangeCode('prod_code_1234567890123456', { token: 't', user: {} }, 60)
        ).rejects.toThrow('Redis shared store is unavailable');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    it('should fail closed in production when Redis is disconnected during code consumption', async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        await expect(
          consumeExchangeCode('prod_code_1234567890123456')
        ).rejects.toThrow('Redis shared store is unavailable');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });
  });

  describe('Account Linking & Database Integrity', () => {
    it('should register a new user with Google OAuth when user does not exist yet', async () => {
      process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret';

      const { stateToken, nonce } = generateOAuthState('google');

      vi.spyOn(axios, 'post').mockResolvedValueOnce({
        data: { access_token: 'mock_access_token_new' },
      });

      vi.spyOn(axios, 'get').mockResolvedValueOnce({
        data: {
          sub: 'google_user_unique_101',
          email: 'newgooglecreator@example.com',
          email_verified: true,
          name: 'New Google Creator',
          picture: 'https://lh3.googleusercontent.com/avatar101.jpg',
        },
      });

      const res = await request(app)
        .get(`/api/auth/google/callback?code=valid_auth_code&state=${stateToken}&format=json`)
        .set('Cookie', [`oauth_state_google=${nonce}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.isNew).toBe(true);
      expect(res.body.isLinked).toBe(false);
      expect(res.body.user.email).toBe('newgooglecreator@example.com');
      expect(res.body.user.authProvider).toBe('google');

      // Verify user in database
      const dbUser = await User.findOne({ email: 'newgooglecreator@example.com' });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.googleId).toBe('google_user_unique_101');
      expect(dbUser?.avatar).toBe('https://lh3.googleusercontent.com/avatar101.jpg');
    });

    it('should safely link an existing local user account when email matches, keeping their local password intact', async () => {
      process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret';

      // 1. Pre-register a user locally with email and password
      const localPassword = 'localPassword123!';
      const localUser = await User.create({
        name: 'Existing Local Creator',
        email: 'local_creator@example.com',
        password: localPassword,
        role: 'USER',
        authProvider: 'local',
      });

      // 2. User logs in via Google with verified email
      const { stateToken, nonce } = generateOAuthState('google');

      vi.spyOn(axios, 'post').mockResolvedValueOnce({
        data: { access_token: 'mock_access_token_link' },
      });

      vi.spyOn(axios, 'get').mockResolvedValueOnce({
        data: {
          sub: 'google_linked_id_999',
          email: 'local_creator@example.com',
          email_verified: true,
          name: 'Existing Local Creator',
          picture: 'https://lh3.googleusercontent.com/avatar999.jpg',
        },
      });

      const res = await request(app)
        .get(`/api/auth/google/callback?code=link_code&state=${stateToken}&format=json`)
        .set('Cookie', [`oauth_state_google=${nonce}`]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.isLinked).toBe(true);
      expect(res.body.isNew).toBe(false);
      expect(res.body.token).toBeDefined();

      // Verify account linking in database
      const updatedUser = await User.findById(localUser._id);
      expect(updatedUser?.googleId).toBe('google_linked_id_999');

      // 3. Crucial verification: Local email/password login MUST STILL WORK!
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'local_creator@example.com',
          password: localPassword,
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.body.token).toBeDefined();
    });

    it('should detect account collisions when an email is already linked to a DIFFERENT Google account (409)', async () => {
      process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret';

      // User already linked to google_id_original
      await User.create({
        name: 'Collision User',
        email: 'collision@example.com',
        authProvider: 'google',
        googleId: 'google_id_original',
        role: 'USER',
      });

      const { stateToken, nonce } = generateOAuthState('google');

      vi.spyOn(axios, 'post').mockResolvedValueOnce({
        data: { access_token: 'mock_token_collision' },
      });

      // Different Google account tries to log in with the same email
      vi.spyOn(axios, 'get').mockResolvedValueOnce({
        data: {
          sub: 'google_id_IMPOSTOR_DIFFERENT',
          email: 'collision@example.com',
          email_verified: true,
          name: 'Impostor Google',
        },
      });

      const res = await request(app)
        .get(`/api/auth/google/callback?code=collision_code&state=${stateToken}&format=json`)
        .set('Cookie', [`oauth_state_google=${nonce}`]);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('already linked to a different Google account');
    });

    it('should block disabled user from logging in via Google OAuth (403)', async () => {
      process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'mock-google-client-secret';

      await User.create({
        name: 'Banned Google User',
        email: 'banned@example.com',
        authProvider: 'google',
        googleId: 'google_banned_123',
        status: 'disabled',
        role: 'USER',
      });

      const { stateToken, nonce } = generateOAuthState('google');

      vi.spyOn(axios, 'post').mockResolvedValueOnce({
        data: { access_token: 'mock_token_banned' },
      });

      vi.spyOn(axios, 'get').mockResolvedValueOnce({
        data: {
          sub: 'google_banned_123',
          email: 'banned@example.com',
          email_verified: true,
          name: 'Banned Google User',
        },
      });

      const res = await request(app)
        .get(`/api/auth/google/callback?code=banned_code&state=${stateToken}&format=json`)
        .set('Cookie', [`oauth_state_google=${nonce}`]);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('disabled');
    });

    it('should instruct passwordless OAuth users to use Google login when attempting email/password login', async () => {
      await User.create({
        name: 'OAuth Only User',
        email: 'oauthonly@example.com',
        authProvider: 'google',
        googleId: 'google_oauth_only_123',
        role: 'USER',
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'oauthonly@example.com',
          password: 'some_password',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('registered using google OAuth');
    });
  });
});
