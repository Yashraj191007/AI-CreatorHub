import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { OAuth2Client } from 'google-auth-library';
import { User, IUser } from '../models/User.js';
import { markStateNonceConsumed } from './oauthStore.js';

const JWT_SECRET = process.env.JWT_SECRET || 'aicreatorhub_secure_jwt_secret_key_2026_xyz';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const googleAuthClient = new OAuth2Client();

export interface OAuthStatePayload {
  nonce: string;
  provider: 'google' | 'github';
  redirectUri?: string;
  createdAt: number;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

export interface AuthResult {
  user: IUser;
  token: string;
  isNew: boolean;
  isLinked: boolean;
}

/**
 * Checks whether Google OAuth is configured via environment variables.
 */
export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Gets configured Google OAuth options.
 */
export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const appUrl = process.env.APP_URL || 'http://localhost:5000';
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL || `${appUrl}/api/auth/google/callback`;

  return {
    clientId,
    clientSecret,
    callbackUrl,
  };
}

/**
 * Sanitizes and validates post-authentication redirect paths.
 * Prevents open-redirect vulnerabilities by strictly requiring internal relative paths.
 */
export function sanitizeRedirectPath(targetPath?: string): string {
  if (!targetPath || typeof targetPath !== 'string') {
    return '/dashboard';
  }

  const trimmed = targetPath.trim();

  // Must begin with a single slash, cannot start with // (protocol-relative url)
  // Cannot contain colon (e.g. javascript:, http:, https:)
  // Cannot contain backslashes
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    trimmed.includes(':') ||
    trimmed.includes('\\')
  ) {
    return '/dashboard';
  }

  // Disallow CRLF or control characters
  if (/[\r\n\t]/.test(trimmed)) {
    return '/dashboard';
  }

  return trimmed;
}

/**
 * Generates a signed, tamper-proof OAuth state token with a cryptographic nonce.
 * Expiration is strictly enforced to 10 minutes to protect against replay attacks.
 */
export function generateOAuthState(
  provider: 'google' | 'github',
  redirectUri?: string
): { stateToken: string; nonce: string } {
  const nonce = crypto.randomBytes(24).toString('hex');
  const safeRedirect = sanitizeRedirectPath(redirectUri);

  const payload: OAuthStatePayload = {
    nonce,
    provider,
    redirectUri: safeRedirect,
    createdAt: Date.now(),
  };

  const stateToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '10m' });
  return { stateToken, nonce };
}

/**
 * Verifies the validity, signature, non-tampering, and single-use of an OAuth state token.
 * Also checks double-submit cookie nonce and prevents state replay via atomic store.
 */
export async function verifyOAuthState(
  stateToken: string,
  expectedProvider: 'google' | 'github',
  cookieNonce?: string
): Promise<OAuthStatePayload> {
  if (!stateToken || typeof stateToken !== 'string') {
    throw new Error('OAuth state parameter is missing or invalid.');
  }

  let decoded: OAuthStatePayload;
  try {
    decoded = jwt.verify(stateToken, JWT_SECRET) as OAuthStatePayload;
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw new Error('OAuth state has expired. Please initiate login again.');
    }
    throw new Error('Invalid OAuth state signature. Potential CSRF attempt detected.');
  }

  if (decoded.provider !== expectedProvider) {
    throw new Error(`State provider mismatch: expected ${expectedProvider}, got ${decoded.provider}`);
  }

  // Double-submit cookie verification if client sent the state cookie
  if (cookieNonce && cookieNonce !== decoded.nonce) {
    throw new Error('CSRF validation failed: state nonce does not match cookie nonce.');
  }

  // Atomic replay prevention: state nonce can only be consumed once
  const isFresh = await markStateNonceConsumed(decoded.nonce);
  if (!isFresh) {
    throw new Error('OAuth state has already been used (replay detected). Please initiate login again.');
  }

  return decoded;
}

/**
 * Generates the full Google OAuth 2.0 authorization URL.
 */
export function getGoogleAuthUrl(stateToken: string, customRedirectUri?: string): string {
  const config = getGoogleOAuthConfig();
  if (!config.clientId) {
    throw new Error('Google OAuth is not configured. Missing GOOGLE_CLIENT_ID.');
  }

  const redirectUri = customRedirectUri || config.callbackUrl;
  const scopes = ['openid', 'email', 'profile'].join(' ');

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    state: stateToken,
    access_type: 'offline',
    prompt: 'select_account',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Exchanges an authorization code for tokens with Google's token endpoint.
 */
export async function exchangeGoogleCode(
  code: string,
  customRedirectUri?: string
): Promise<{ access_token: string; id_token?: string }> {
  const config = getGoogleOAuthConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Google OAuth credentials not configured (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing).');
  }

  const redirectUri = customRedirectUri || config.callbackUrl;

  try {
    const response = await axios.post(
      'https://oauth2.googleapis.com/token',
      {
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 10000,
      }
    );

    if (!response.data || !response.data.access_token) {
      throw new Error('Invalid token response from Google: access_token missing.');
    }

    return response.data;
  } catch (err: any) {
    const errorDetails = err.response?.data?.error_description || err.response?.data?.error || err.message;
    throw new Error(`Google token exchange failed: ${errorDetails}`);
  }
}

/**
 * Validates Google ID token signature, audience, issuer, expiration, and identity claims
 * using Google's official google-auth-library OAuth2Client.
 */
export async function verifyGoogleIdToken(idToken: string, clientId?: string): Promise<GoogleProfile> {
  const targetClientId = clientId || process.env.GOOGLE_CLIENT_ID;
  if (!targetClientId) {
    throw new Error('GOOGLE_CLIENT_ID not configured for ID token verification.');
  }

  const ticket = await googleAuthClient.verifyIdToken({
    idToken,
    audience: targetClientId,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error('Invalid Google ID token payload: missing sub or email.');
  }

  // Validate issuer claim
  const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
  if (!payload.iss || !validIssuers.includes(payload.iss)) {
    throw new Error(`Invalid Google ID token issuer: ${payload.iss}`);
  }

  return {
    sub: payload.sub,
    email: payload.email,
    email_verified: Boolean(payload.email_verified),
    name: payload.name || payload.given_name || payload.email.split('@')[0],
    picture: payload.picture,
    given_name: payload.given_name,
    family_name: payload.family_name,
  };
}

/**
 * Fetches verified user identity profile from Google's OpenID Connect userinfo endpoint.
 */
export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  try {
    const response = await axios.get<GoogleProfile>('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 10000,
    });

    const data = response.data;
    if (!data || !data.sub || !data.email) {
      throw new Error('Invalid userinfo response from Google: missing user id or email.');
    }

    return data;
  } catch (err: any) {
    const errorDetails = err.response?.data?.error_description || err.response?.data?.error || err.message;
    throw new Error(`Failed to retrieve Google profile: ${errorDetails}`);
  }
}

/**
 * Issues application JWT token for an authenticated user.
 */
export function issueUserToken(userId: string): string {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
}

/**
 * Safely authenticates, links, or creates a user account based on verified Google profile.
 * - Prevents account takeover by strictly verifying email_verified === true
 * - Enforces unique Google ID constraints
 * - Prevents account collisions when email is already bound to a different Google account
 * - Safely links existing local accounts by email while preserving their local password
 * - Gracefully handles concurrent registrations via MongoDB duplicate key handling
 * - Enforces account status checks (blocks disabled accounts)
 */
export async function authenticateWithGoogleProfile(profile: GoogleProfile): Promise<AuthResult> {
  // CRITICAL SECURITY CHECK: Ensure email is verified by Google to prevent pre-account takeover
  if (profile.email_verified !== true) {
    const unverifiedErr: any = new Error(
      'Google account email is not verified. AI-CreatorHub requires a verified email address for secure OAuth login.'
    );
    unverifiedErr.statusCode = 400;
    throw unverifiedErr;
  }

  const normalizedEmail = profile.email.toLowerCase().trim();

  // 1. Check if user with matching googleId already exists
  let user = await User.findOne({ googleId: profile.sub });

  if (user) {
    if (user.status === 'disabled') {
      const disabledErr: any = new Error('Your account has been disabled by an admin.');
      disabledErr.statusCode = 403;
      throw disabledErr;
    }

    // Update avatar if not already set and profile picture exists
    if (!user.avatar && profile.picture) {
      user.avatar = profile.picture;
      await user.save();
    }

    const token = issueUserToken(user._id.toString());
    return { user, token, isNew: false, isLinked: false };
  }

  // 2. Safe Account Linking: Check if user with matching email already exists
  user = await User.findOne({ email: normalizedEmail });

  if (user) {
    if (user.status === 'disabled') {
      const disabledErr: any = new Error('Your account has been disabled by an admin.');
      disabledErr.statusCode = 403;
      throw disabledErr;
    }

    // Account Collision Defense: If user already has a DIFFERENT googleId linked, block linking
    if (user.googleId && user.googleId !== profile.sub) {
      const conflictErr: any = new Error(
        'Account collision: This email is already linked to a different Google account.'
      );
      conflictErr.statusCode = 409;
      throw conflictErr;
    }

    // Safe linking: Link googleId to existing account
    user.googleId = profile.sub;
    if (!user.avatar && profile.picture) {
      user.avatar = profile.picture;
    }
    // Existing password remains untouched, allowing both password and Google OAuth login!
    await user.save();

    const token = issueUserToken(user._id.toString());
    return { user, token, isNew: false, isLinked: true };
  }

  // 3. New User Registration via Google OAuth with race-condition handling
  const displayName = profile.name?.trim() || profile.given_name?.trim() || normalizedEmail.split('@')[0];

  try {
    const newUser = await User.create({
      name: displayName,
      email: normalizedEmail,
      role: 'USER',
      status: 'active',
      authProvider: 'google',
      googleId: profile.sub,
      avatar: profile.picture || '',
    });

    const token = issueUserToken(newUser._id.toString());
    return { user: newUser, token, isNew: true, isLinked: false };
  } catch (err: any) {
    // Concurrency defense: If a parallel callback created the user simultaneously (MongoDB code 11000)
    if (err.code === 11000) {
      const conflictUser = await User.findOne({
        $or: [{ googleId: profile.sub }, { email: normalizedEmail }],
      });
      if (conflictUser) {
        if (conflictUser.status === 'disabled') {
          const disabledErr: any = new Error('Your account has been disabled by an admin.');
          disabledErr.statusCode = 403;
          throw disabledErr;
        }

        // Account collision defense: Cannot link if already bound to a different Google ID
        if (conflictUser.googleId && conflictUser.googleId !== profile.sub) {
          const conflictErr: any = new Error(
            'Account collision: This email is already linked to a different Google account.'
          );
          conflictErr.statusCode = 409;
          throw conflictErr;
        }

        // Safe account linking if user existed without googleId
        let isLinked = false;
        if (!conflictUser.googleId) {
          conflictUser.googleId = profile.sub;
          if (!conflictUser.avatar && profile.picture) {
            conflictUser.avatar = profile.picture;
          }
          await conflictUser.save();
          isLinked = true;
        }

        const token = issueUserToken(conflictUser._id.toString());
        return {
          user: conflictUser,
          token,
          isNew: false,
          isLinked,
        };
      }
    }
    throw err;
  }
}
