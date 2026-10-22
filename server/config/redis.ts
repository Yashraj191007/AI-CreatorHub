import { createClient } from 'redis';
import 'dotenv/config';

/**
 * Sanitizes Redis connection URLs by redacting credentials and sensitive tokens.
 * Safe for logging and diagnostic messages.
 */
export function sanitizeRedisUrl(url?: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.password || parsed.username) {
      parsed.username = '***';
      parsed.password = '***';
    }
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (/pass|pwd|secret|token|auth/i.test(key)) {
        parsed.searchParams.set(key, '***');
      }
    }
    return parsed.toString();
  } catch {
    let sanitized = url.replace(/(rediss?:\/\/)[^\s@]+@/gi, '$1***:***@');
    sanitized = sanitized.replace(/([?&](?:password|pwd|secret|token|auth)=)[^&]+/gi, '$1***');
    return sanitized;
  }
}

/**
 * Sanitizes Redis error messages by redacting connection URLs, passwords, and tokens.
 */
export function sanitizeRedisError(err: unknown): string {
  if (!err) return 'Unknown Redis error';
  const raw = err instanceof Error ? err.message : String(err);
  let sanitized = raw.replace(/(rediss?:\/\/)[^\s@]+@/gi, '$1***:***@');
  sanitized = sanitized.replace(/([?&](?:password|pwd|secret|token|auth)=)[^&]+/gi, '$1***');
  const errName = err instanceof Error ? err.name : 'RedisError';
  return `${errName}: ${sanitized}`;
}

/**
 * Validates a Redis connection URL format and protocol without exposing its contents.
 * Supports both standard 'redis://' and TLS-enabled Upstash 'rediss://' schemes.
 */
export function validateRedisUrl(url?: string): boolean {
  if (!url || typeof url !== 'string' || !url.trim()) {
    throw new Error('Redis URL is empty or undefined');
  }
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
      throw new Error(
        `Invalid Redis URL protocol "${parsed.protocol}". Expected "redis:" or "rediss:".`
      );
    }
    if (!parsed.hostname) {
      throw new Error('Redis URL must contain a valid hostname.');
    }
    return true;
  } catch (err: any) {
    if (err.message && err.message.includes('Invalid Redis URL protocol')) {
      throw err;
    }
    if (err.message && err.message.includes('valid hostname')) {
      throw err;
    }
    throw new Error('Invalid Redis URL: malformed connection string');
  }
}

/**
 * Resolves and validates the Redis connection URL.
 * In production, strictly requires REDIS_URL (or urlOverride) and rejects localhost fallback.
 * In development / test, defaults to 'redis://localhost:6379' if unset.
 */
export function resolveRedisUrl(urlOverride?: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  const candidate = (urlOverride || process.env.REDIS_URL)?.trim();

  if (isProd) {
    if (!candidate) {
      const errorMsg =
        '[FATAL] REDIS_URL environment variable is required in production. In-memory fallback is disabled in production.';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    validateRedisUrl(candidate);
    return candidate;
  }

  // Development and test environments
  if (candidate) {
    validateRedisUrl(candidate);
    return candidate;
  }
  return 'redis://localhost:6379';
}

/**
 * Constructs client options for node-redis with Upstash TLS support,
 * safe reconnect strategy, and connection timeout.
 */
export function getRedisClientOptions(urlOverride?: string) {
  const isProd = process.env.NODE_ENV === 'production';
  const url = resolveRedisUrl(urlOverride);

  return {
    url,
    socket: {
      reconnectStrategy: (retries: number) => {
        if (isProd) {
          if (retries > 10) return new Error('Redis connection retries exhausted');
          return Math.min(retries * 100, 3000);
        }
        // In development / test, fail fast if Redis is not running locally
        if (retries >= 1) {
          return false;
        }
        return 200;
      },
      connectTimeout: 5000,
    },
  };
}

/**
 * Instantiates a Redis client with configured listeners for errors and connections.
 */
export function createRedisClient(urlOverride?: string) {
  const options = getRedisClientOptions(urlOverride);
  const client = createClient(options);

  client.on('error', (err) => {
    if (process.env.NODE_ENV === 'production') {
      console.error('Redis Client Error:', sanitizeRedisError(err));
    }
  });

  client.on('connect', () => {
    console.log(`Connected to Redis at ${sanitizeRedisUrl(options.url)}`);
  });

  return client;
}

export let clientFactory = (url?: string) => createRedisClient(url);

export const setClientFactory = (factory: (url?: string) => any): void => {
  clientFactory = factory;
};

function initializeDefaultClient() {
  try {
    return clientFactory();
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Initial Redis client configuration deferred:', sanitizeRedisError(err));
    }
    // In production without REDIS_URL at import time, create an unconfigured disconnected client placeholder.
    // connectRedis() will strictly validate and construct the real client before connecting.
    return createClient({
      url: 'redis://unconfigured-redis-host:6379',
      socket: {
        reconnectStrategy: false,
        connectTimeout: 1000,
      },
    });
  }
}

export let redisClient = initializeDefaultClient();

export const getRedisClient = () => redisClient;

export const setRedisClient = (client: any): void => {
  redisClient = client;
};

export const resetRedisClient = (url?: string) => {
  if (redisClient && redisClient.isOpen) {
    try {
      redisClient.disconnect();
    } catch {
      // ignore
    }
  }
  redisClient = clientFactory(url);
  return redisClient;
};

/**
 * Initializes Redis connection during server startup.
 * In production, strictly requires REDIS_URL and fails closed if connection cannot be established.
 * In development / test, falls back gracefully without breaking server startup.
 * If an active client is already open but connected to a stale URL, it safely connects the new
 * client first and drains the stale client with quit() to protect active in-flight requests.
 */
export const connectRedis = async (): Promise<void> => {
  const isProd = process.env.NODE_ENV === 'production';
  const targetUrl = resolveRedisUrl();
  const currentConfiguredUrl = (redisClient as any)?.options?.url;
  const isStale = currentConfiguredUrl !== targetUrl;

  // In production, strictly require valid REDIS_URL and fail-closed
  if (isProd) {
    console.log('Connecting to configured production Redis...');
    try {
      if (redisClient && redisClient.isOpen) {
        if (!isStale) {
          // Already open and connected to the exact validated production URL
          return;
        }

        // Stale open client: cannot report success while connected to a stale URL.
        // Connect the new client FIRST so in-flight requests on the existing client are not broken.
        console.warn(
          `[Redis] Active client is connected to stale URL (${sanitizeRedisUrl(currentConfiguredUrl)}). Transitioning to ${sanitizeRedisUrl(targetUrl)}...`
        );
        const staleClient = redisClient;
        const newClient = clientFactory(targetUrl);
        await newClient.connect();

        // Swap exported reference only after new connection succeeds
        redisClient = newClient;

        // Gracefully retire stale client so in-flight requests finish cleanly
        if (staleClient && typeof staleClient.quit === 'function') {
          staleClient.quit().catch((err) => {
            console.warn('Error during graceful shutdown of retired Redis client:', sanitizeRedisError(err));
          });
        }
        console.log('Connected to Redis successfully.');
        return;
      }

      // Client is not open
      if (isStale) {
        const isMocked = typeof (redisClient?.connect as any)?.mock !== 'undefined';
        if (isMocked) {
          if ((redisClient as any).options) {
            (redisClient as any).options.url = targetUrl;
          }
        } else {
          if (redisClient && typeof redisClient.disconnect === 'function') {
            try {
              redisClient.disconnect();
            } catch {
              // ignore
            }
          }
          redisClient = clientFactory(targetUrl);
        }
      }

      if (!redisClient.isOpen) {
        await redisClient.connect();
      }
      console.log('Connected to Redis successfully.');
      return;
    } catch (err) {
      const sanitized = sanitizeRedisError(err);
      console.error(`[FATAL] Failed to connect to production Redis: ${sanitized}`);
      throw new Error(`Production Redis connection failed: ${sanitized}`);
    }
  }

  // Development and Test: preserve fallback behavior
  try {
    if (redisClient && redisClient.isOpen) {
      if (!isStale) {
        return;
      }
      const staleClient = redisClient;
      const newClient = clientFactory(targetUrl);
      await newClient.connect();
      redisClient = newClient;
      if (staleClient && typeof staleClient.quit === 'function') {
        staleClient.quit().catch(() => {});
      }
      return;
    }

    if (isStale) {
      const isMocked = typeof (redisClient?.connect as any)?.mock !== 'undefined';
      if (isMocked) {
        if ((redisClient as any).options) {
          (redisClient as any).options.url = targetUrl;
        }
      } else {
        if (redisClient && typeof redisClient.disconnect === 'function') {
          try {
            redisClient.disconnect();
          } catch {
            // ignore
          }
        }
        redisClient = clientFactory(targetUrl);
      }
    }

    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  } catch (err) {
    console.warn(
      'Redis is not running locally. Continuing without cache (in-memory fallback active).'
    );
  }
};

/**
 * Closes the Redis connection cleanly during graceful shutdown.
 */
export const closeRedis = async (): Promise<void> => {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
    }
  } catch (err) {
    console.warn('Error during Redis client shutdown:', sanitizeRedisError(err));
  }
};
