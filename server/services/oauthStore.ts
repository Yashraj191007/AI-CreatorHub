import { redisClient } from '../config/redis.js';

interface ExchangeRecord {
  payload: {
    token: string;
    user: any;
  };
  expiresAt: number;
}

// In-memory fallback stores for non-Redis environments (testing / standalone)
const memoryExchangeStore = new Map<string, ExchangeRecord>();
const memoryConsumedNonces = new Set<string>();

/**
 * Stores an OAuth single-use exchange code with a short TTL (default: 60 seconds).
 * Leverages Redis when available for multi-instance distributed deployments.
 */
export async function storeExchangeCode(
  code: string,
  payload: { token: string; user: any },
  ttlSeconds = 60
): Promise<void> {
  if (redisClient.isOpen) {
    try {
      await redisClient.setEx(`oauth:exchange:${code}`, ttlSeconds, JSON.stringify(payload));
      return;
    } catch (err) {
      console.error('Redis error while storing exchange code:', err);
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'Redis shared store error during OAuth code storage. Production requires a functional Redis connection.'
        );
      }
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Redis shared store is unavailable. Production OAuth requires a connected Redis instance for distributed single-use exchange codes.'
    );
  }

  memoryExchangeStore.set(code, {
    payload,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });

  const timer = setTimeout(() => {
    memoryExchangeStore.delete(code);
  }, (ttlSeconds + 5) * 1000);
  if (timer.unref) timer.unref();
}

/**
 * Atomically retrieves and immediately deletes an exchange code, guaranteeing single use.
 * Multi-instance safe via Redis atomic Lua script (GET + DEL in single atomic execution).
 */
export async function consumeExchangeCode(
  code: string
): Promise<{ token: string; user: any } | null> {
  if (!code || typeof code !== 'string') {
    return null;
  }

  if (redisClient.isOpen) {
    try {
      // Atomic Lua script: retrieves the stored payload and deletes it atomically
      const luaScript = `
        local val = redis.call('GET', KEYS[1])
        if val then
          redis.call('DEL', KEYS[1])
        end
        return val
      `;
      const result = await redisClient.eval(luaScript, {
        keys: [`oauth:exchange:${code}`],
        arguments: [],
      });

      if (!result) {
        return null;
      }
      return JSON.parse(result as string);
    } catch (err) {
      console.error('Redis error while consuming exchange code:', err);
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'Redis shared store error during OAuth code consumption. Production requires a functional Redis connection.'
        );
      }
    }
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Redis shared store is unavailable. Production OAuth requires a connected Redis instance to consume exchange codes.'
    );
  }

  // Fallback in-memory atomic retrieval
  const record = memoryExchangeStore.get(code);
  if (!record) {
    return null;
  }

  // Burn immediately to prevent replay
  memoryExchangeStore.delete(code);

  if (Date.now() > record.expiresAt) {
    return null;
  }

  return record.payload;
}

/**
 * Marks an OAuth state nonce as consumed atomically to prevent replay attacks.
 * In Redis, uses SET NX (set if not exists) with TTL.
 * Returns true if the nonce was fresh, false if already consumed (replay detected).
 */
export async function markStateNonceConsumed(
  nonce: string,
  ttlSeconds = 600
): Promise<boolean> {
  if (!nonce || typeof nonce !== 'string') {
    return false;
  }

  if (redisClient.isOpen) {
    try {
      const res = await redisClient.set(`oauth:state:nonce:${nonce}`, '1', {
        NX: true,
        EX: ttlSeconds,
      });
      return res === 'OK';
    } catch (err) {
      console.error('Redis error while consuming state nonce:', err);
      if (process.env.NODE_ENV === 'production') {
        return false; // Fail closed: reject state consumption if shared store fails
      }
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('Redis shared store is required in production for OAuth state nonce verification.');
    return false; // Fail closed: reject state consumption without shared store in production
  }

  if (memoryConsumedNonces.has(nonce)) {
    return false;
  }

  memoryConsumedNonces.add(nonce);
  const timer = setTimeout(() => memoryConsumedNonces.delete(nonce), ttlSeconds * 1000);
  if (timer.unref) timer.unref();
  return true;
}

/**
 * Resets stores (primarily for testing purposes).
 */
export function clearMemoryOAuthStore(): void {
  memoryExchangeStore.clear();
  memoryConsumedNonces.clear();
}
