import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import {
  isGoogleOAuthConfigured,
  generateOAuthState,
  verifyOAuthState,
  getGoogleAuthUrl,
  exchangeGoogleCode,
  fetchGoogleProfile,
  verifyGoogleIdToken,
  authenticateWithGoogleProfile,
  sanitizeRedirectPath,
  getGoogleOAuthConfig,
} from '../services/oauthService.js';
import { storeExchangeCode, consumeExchangeCode } from '../services/oauthStore.js';
import { oauthCodeExchangeSchema } from '../validators/authValidator.js';

function getCookie(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function isApiRequest(req: Request): boolean {
  return Boolean(
    req.method === 'POST' ||
    req.xhr ||
    req.headers.accept?.includes('application/json') ||
    req.query.format === 'json'
  );
}

function getFrontendBaseUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  const host = req.get('host') || 'localhost:5000';
  const protocol = req.protocol || 'http';
  return `${protocol}://${host}`;
}

/**
 * Returns available OAuth providers and their status.
 */
export async function getOAuthProviders(_req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    providers: {
      google: {
        configured: isGoogleOAuthConfigured(),
        name: 'Google',
      },
    },
  });
}

/**
 * Initiates the Google OAuth 2.0 flow.
 * - Generates signed tamper-proof state with cryptographic nonce and sanitized return path
 * - Sets httpOnly SameSite cookie for CSRF defense
 * - Redirects browser to Google or returns auth URL for API consumers
 */
export async function initiateGoogleAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isGoogleOAuthConfigured()) {
      res.status(503).json({
        success: false,
        error: 'Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.',
      });
      return;
    }

    const returnTo = sanitizeRedirectPath((req.query.return_to || req.query.redirect_uri) as string);
    const { stateToken, nonce } = generateOAuthState('google', returnTo);

    // Store nonce in an httpOnly SameSite cookie to enforce double-submit CSRF protection
    res.cookie('oauth_state_google', nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
      path: '/',
    });

    const authUrl = getGoogleAuthUrl(stateToken);

    if (isApiRequest(req)) {
      res.json({
        success: true,
        url: authUrl,
        state: stateToken,
      });
      return;
    }

    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
}

/**
 * Handles the OAuth callback from Google.
 * - Validates OAuth state signature, expiry, and single-use consumption (anti-CSRF & replay protection)
 * - Validates provider error responses (e.g. user canceled)
 * - Exchanges authorization code for tokens
 * - Verifies Google ID token / Userinfo profile
 * - Safely links account or creates new user
 * - For browser flows: issues a short-lived single-use exchange code (NO JWT in URL!)
 * - For direct API clients: returns token in JSON response
 */
export async function handleGoogleCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
  const isApi = isApiRequest(req);
  const frontendBase = getFrontendBaseUrl(req);

  try {
    const code = (req.query.code || req.body?.code) as string | undefined;
    const state = (req.query.state || req.body?.state) as string | undefined;
    const errorParam = (req.query.error || req.body?.error) as string | undefined;
    const errorDesc = (req.query.error_description || req.body?.error_description) as string | undefined;

    // 1. Check for provider error callback (e.g., access_denied when user dismisses consent)
    if (errorParam) {
      const message = errorDesc || `Google OAuth canceled: ${errorParam}`;
      if (isApi) {
        res.status(400).json({ success: false, error: message });
        return;
      }
      res.redirect(`${frontendBase}/login?error=${encodeURIComponent(message)}`);
      return;
    }

    // 2. State & CSRF Validation (with atomic replay prevention)
    if (!state) {
      const message = 'OAuth state parameter missing. Request rejected to prevent CSRF.';
      if (isApi) {
        res.status(400).json({ success: false, error: message });
        return;
      }
      res.redirect(`${frontendBase}/login?error=${encodeURIComponent(message)}`);
      return;
    }

    const cookieNonce = getCookie(req, 'oauth_state_google');

    let statePayload;
    try {
      statePayload = await verifyOAuthState(state, 'google', cookieNonce);
    } catch (stateErr: any) {
      if (isApi) {
        res.status(400).json({ success: false, error: stateErr.message });
        return;
      }
      res.redirect(`${frontendBase}/login?error=${encodeURIComponent(stateErr.message)}`);
      return;
    }

    // Clear state cookie with matching attributes once consumed
    res.clearCookie('oauth_state_google', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    // 3. Authorization Code Validation
    if (!code) {
      const message = 'Authorization code is missing from Google callback.';
      if (isApi) {
        res.status(400).json({ success: false, error: message });
        return;
      }
      res.redirect(`${frontendBase}/login?error=${encodeURIComponent(message)}`);
      return;
    }

    // 4. Token Exchange with Google Token Endpoint
    const tokenData = await exchangeGoogleCode(code);

    // 5. Verify Identity Claims: Validate ID token if present, or fetch from userinfo endpoint
    let profile;
    const config = getGoogleOAuthConfig();

    if (tokenData.id_token) {
      // Strictly verify signature, audience, issuer, and claims using google-auth-library
      profile = await verifyGoogleIdToken(tokenData.id_token, config.clientId);
    } else {
      profile = await fetchGoogleProfile(tokenData.access_token);
    }

    // 6. Safe Account Linking / Creation
    const { user, token, isNew, isLinked } = await authenticateWithGoogleProfile(profile);

    const safeUser = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      avatar: user.avatar,
      authProvider: user.authProvider,
      bio: user.bio,
      createdAt: user.createdAt,
    };

    if (isApi) {
      res.json({
        success: true,
        token,
        user: safeUser,
        isNew,
        isLinked,
      });
      return;
    }

    // 7. Secure Token Handoff via Ephemeral Single-Use Exchange Code (NEVER PUT JWT IN URL!)
    const exchangeCode = crypto.randomBytes(32).toString('hex');
    await storeExchangeCode(exchangeCode, { token, user: safeUser }, 60); // 60s TTL

    const safeReturnTo = sanitizeRedirectPath(statePayload.redirectUri);
    const redirectUrl = `${frontendBase}/login?oauth_code=${encodeURIComponent(
      exchangeCode
    )}&return_to=${encodeURIComponent(safeReturnTo)}`;

    res.redirect(redirectUrl);
  } catch (error: any) {
    const statusCode = error.statusCode || 400;
    const message = error.message || 'OAuth authentication failed.';

    if (isApi) {
      res.status(statusCode).json({ success: false, error: message });
      return;
    }

    res.redirect(`${frontendBase}/login?error=${encodeURIComponent(message)}`);
  }
}

/**
 * Exchanges a single-use, short-lived OAuth exchange code for an application JWT.
 * Atomically consumes the code from the shared store (Redis/memory) to prevent replay.
 */
export async function exchangeOAuthCode(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = oauthCodeExchangeSchema.parse(req.body);

    const payload = await consumeExchangeCode(validated.code);
    if (!payload) {
      res.status(400).json({
        success: false,
        error: 'Invalid or expired OAuth exchange code. Please initiate login again.',
      });
      return;
    }

    res.json({
      success: true,
      token: payload.token,
      user: payload.user,
    });
  } catch (error) {
    next(error);
  }
}
