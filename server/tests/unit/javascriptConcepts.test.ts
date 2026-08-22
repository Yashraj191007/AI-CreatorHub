import { describe, it, expect, vi } from 'vitest';
import {
  demonstrateFunctionHoisting,
  demonstrateVarHoisting,
  demonstrateTDZ,
  demonstrateEventLoopOrder,
  createRateLimiterClosure,
  fetchContentWithCallback,
  fetchContentWithPromise,
  fetchContentWithPromiseChain,
} from '../../utils/javascriptConcepts.js';
import { authorize } from '../../middleware/authMiddleware.js';

describe('JavaScript Runtime Concepts - Viva Preparation Suite', () => {
  describe('Hoisting Demonstrations', () => {
    
    it('should demonstrate function declaration hoisting', () => {
      // Function declaration hoisting allows invoking a function before its declaration
      const result = demonstrateFunctionHoisting();
      expect(result).toBe('I am hoisted!');
    });

    it('should demonstrate var hoisting', () => {
      // 'var' declarations are hoisted and initialized with undefined
      const result = demonstrateVarHoisting();
      expect(result.valueBeforeInitialization).toBeUndefined();
      expect(result.valueAfterInitialization).toBe('initialized value');
    });

    it('should demonstrate Temporal Dead Zone (TDZ) for let/const', () => {
      // 'let' and 'const' declarations are hoisted but not initialized, resulting in ReferenceError
      const result = demonstrateTDZ() as { name: string; message: string };
      // It should throw an error, which we caught and returned as an object
      expect(result.name).toBe('ReferenceError');
      // The exact error message might vary by engine, but it usually mentions initialization
      expect(result.message).toMatch(/access|initializ/i);
    });
  });

  describe('Event Loop Demonstrations', () => {
    
    it('should demonstrate event loop execution order (Sync -> Microtask -> Macrotask) and state consistency', async () => {
      // Awaits the promise which resolves when the setTimeout macrotask runs
      const { executionOrder, stateObservedByTimer } = await demonstrateEventLoopOrder();
      
      // Verification of the Event Loop order:
      // 1. Synchronous code executes immediately on the Call Stack ('sync-start', 'sync-end')
      // 2. Promise callbacks (Microtasks) execute immediately after sync code finishes ('promise-microtask')
      // 3. setTimeout callbacks (Macrotasks) execute in a future tick of the event loop ('timer-macrotask')
      expect(executionOrder).toEqual([
        'sync-start',
        'sync-end',
        'promise-microtask',
        'timer-macrotask'
      ]);

      // Verification of why ordering matters for application behavior:
      // Because microtasks are processed before the timer macrotask, the state update performed
      // inside the Promise microtask ('updated-by-microtask') is visible when the timer runs.
      expect(stateObservedByTimer).toBe('updated-by-microtask');
    });
  });

  describe('JavaScript Closures (Production Middleware & State Encapsulation)', () => {
    it('should retain access to closed-over roles via lexical scope closure in authorize()', () => {
      // authorize('ADMIN') returns an inner middleware closure that retains outer 'roles' variable
      const adminOnlyMiddleware = authorize('ADMIN');

      // 1. Test rejected role access
      const userReq = { user: { role: 'USER' } } as any;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const nextUser = vi.fn();

      adminOnlyMiddleware(userReq, res, nextUser);

      // The closure retained 'ADMIN', so user role 'USER' is rejected with 403
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: "User role 'USER' is not authorized to perform this action",
      }));
      expect(nextUser).not.toHaveBeenCalled();

      // 2. Test allowed role access
      const adminReq = { user: { role: 'ADMIN' } } as any;
      const nextAdmin = vi.fn();

      adminOnlyMiddleware(adminReq, res, nextAdmin);

      // The closure retained 'ADMIN', matching adminReq.user.role and invoking next()
      expect(nextAdmin).toHaveBeenCalledTimes(1);
    });

    it('should encapsulate private state across multiple calls using createRateLimiterClosure()', () => {
      // Create closure allowing max 2 calls
      const limiter = createRateLimiterClosure(2);

      // First call (allowed, 1 remaining)
      const res1 = limiter();
      expect(res1.allowed).toBe(true);
      expect(res1.remaining).toBe(1);

      // Second call (allowed, 0 remaining)
      const res2 = limiter();
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(0);

      // Third call (blocked by closure state check)
      const res3 = limiter();
      expect(res3.allowed).toBe(false);
      expect(res3.remaining).toBe(0);
    });
  });

  describe('Promises vs Callbacks Demonstrations', () => {
    it('should handle asynchronous flow using traditional error-first callbacks', () => {
      return new Promise<void>((resolve, reject) => {
        fetchContentWithCallback('content-101', (err, data) => {
          try {
            expect(err).toBeNull();
            expect(data).toBeDefined();
            expect(data?.title).toBe('Callback Content Title');
            
            fetchContentWithCallback('invalid', (errInvalid, dataInvalid) => {
              try {
                expect(errInvalid).toBeInstanceOf(Error);
                expect(errInvalid?.message).toBe('Invalid content ID in callback');
                expect(dataInvalid).toBeUndefined();
                resolve();
              } catch (e) {
                reject(e);
              }
            });
          } catch (e) {
            reject(e);
          }
        });
      });
    });

    it('should handle asynchronous flow using modern ES6 Promises / async await', async () => {
      // Valid Promise resolution
      const data = await fetchContentWithPromise('content-101');
      expect(data.title).toBe('Promise Content Title');

      // Rejected Promise handling
      await expect(fetchContentWithPromise('invalid')).rejects.toThrow('Invalid content ID in Promise');
    });

    it('should handle sequential asynchronous transformations via ES6 Promise Chaining (.then/.catch)', async () => {
      // Test successful promise chain resolution
      const result = await fetchContentWithPromiseChain('content-101');
      expect(result).toBe('PROMISE CONTENT TITLE [FORMATTED]');

      // Test promise chain error handling
      await expect(fetchContentWithPromiseChain('invalid')).rejects.toThrow('Promise Chain Error: Invalid content ID in Promise');
    });
  });
});


