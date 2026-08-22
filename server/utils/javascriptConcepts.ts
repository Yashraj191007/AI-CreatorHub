/**
 * Demonstrates JavaScript Function Declaration Hoisting.
 * Returns the result of calling a function before its declaration in the source code.
 */
export const demonstrateFunctionHoisting = (): string => {
  // Invoking hoistedFunction before it is declared below
  return hoistedFunction();

  function hoistedFunction() {
    return 'I am hoisted!';
  }
};

/**
 * Demonstrates JavaScript `var` Hoisting.
 * Returns the value of a `var` variable before it is initialized.
 */
export const demonstrateVarHoisting = () => {
  // Use new Function to cleanly isolate the JS runtime execution from TypeScript's static analyzer
  const testHoisting = new Function(`
    var valueBeforeInitialization = hoistedVar;
    var hoistedVar = 'initialized value';
    return {
      valueBeforeInitialization: valueBeforeInitialization,
      valueAfterInitialization: hoistedVar
    };
  `);
  
  return testHoisting();
};

/**
 * Demonstrates the Temporal Dead Zone (TDZ) for `let`/`const`.
 * Attempting to access the variable before initialization will throw a ReferenceError.
 */
export const demonstrateTDZ = () => {
  try {
    // Use new Function to cleanly isolate the JS runtime execution from TypeScript's static analyzer
    const testTDZ = new Function(`
      const x = tdzVariable;
      let tdzVariable = 'I am in TDZ';
      return x;
    `);
    testTDZ();
  } catch (error: unknown) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message
      };
    }
    return {
      name: 'UnknownError',
      message: 'An unknown error occurred'
    };
  }
};

export interface EventLoopResult {
  executionOrder: string[];
  stateObservedByTimer: string;
}

/**
 * Demonstrates the JavaScript Event Loop execution order and state consistency.
 * Returns a promise that resolves to an object containing execution steps and state observed by macrotasks.
 * 
 * Order of execution demonstrated:
 * 1. Synchronous operations (executed immediately on the main thread Call Stack)
 * 2. Microtasks (Promise callbacks, executed after current Call Stack empties, before next event loop tick)
 * 3. Macrotasks (setTimeout callbacks, executed in a subsequent event loop tick)
 * 
 * Why ordering matters for application behavior:
 * Microtask queue priority ensures Promise state updates (e.g. async state hydration/resolution)
 * complete before scheduled Macrotasks (timers or I/O callbacks) inspect or act upon application state.
 */
export const demonstrateEventLoopOrder = (): Promise<EventLoopResult> => {
  return new Promise((resolve) => {
    const executionOrder: string[] = [];
    const state = { value: 'initial-sync-state' };

    // 1. Synchronous Code (Call Stack)
    executionOrder.push('sync-start');

    // 3. Macrotask (Timer Queue)
    setTimeout(() => {
      executionOrder.push('timer-macrotask');
      // Resolve after the macrotask executes, reporting the state observed by the timer
      resolve({
        executionOrder,
        stateObservedByTimer: state.value,
      });
    }, 0);

    // 2. Microtask (Promise Queue)
    Promise.resolve().then(() => {
      state.value = 'updated-by-microtask';
      executionOrder.push('promise-microtask');
    });

    // 1. Synchronous Code (Call Stack)
    executionOrder.push('sync-end');
  });
};

/**
 * Demonstrates JavaScript Closure Semantics.
 * Creates a rate limiter function that encapsulates state (`callCount` and `maxCalls`)
 * inside an outer scope, returning an inner function that retains access to outer variables.
 */
export const createRateLimiterClosure = (maxCalls: number) => {
  let callCount = 0; // State preserved across invocations via closure

  return (): { allowed: boolean; remaining: number } => {
    if (callCount < maxCalls) {
      callCount++;
      return { allowed: true, remaining: maxCalls - callCount };
    }
    return { allowed: false, remaining: 0 };
  };
};

/**
 * Demonstrates Callback-based asynchronous flow (traditional error-first callback pattern).
 */
export const fetchContentWithCallback = (
  contentId: string,
  callback: (err: Error | null, data?: { id: string; title: string }) => void
): void => {
  setTimeout(() => {
    if (!contentId || contentId === 'invalid') {
      callback(new Error('Invalid content ID in callback'));
    } else {
      callback(null, { id: contentId, title: 'Callback Content Title' });
    }
  }, 10);
};

/**
 * Demonstrates Promise-based asynchronous flow (modern ES6 Promise pattern).
 */
export const fetchContentWithPromise = (contentId: string): Promise<{ id: string; title: string }> => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (!contentId || contentId === 'invalid') {
        reject(new Error('Invalid content ID in Promise'));
      } else {
        resolve({ id: contentId, title: 'Promise Content Title' });
      }
    }, 10);
  });
};

/**
 * Demonstrates ES6 Promise Chaining (.then -> .then -> .catch).
 * Transforms and processes async result sequentially using explicit promise handlers.
 */
export const fetchContentWithPromiseChain = (contentId: string): Promise<string> => {
  return fetchContentWithPromise(contentId)
    .then((data) => {
      // First transformation step in promise chain
      return `${data.title} [Formatted]`;
    })
    .then((formattedTitle) => {
      // Second transformation step in promise chain
      return formattedTitle.toUpperCase();
    })
    .catch((err) => {
      // Centralized error handler in promise chain
      throw new Error(`Promise Chain Error: ${err.message}`);
    });
};


