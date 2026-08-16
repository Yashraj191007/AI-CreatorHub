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

/**
 * Demonstrates the JavaScript Event Loop execution order.
 * Returns a promise that resolves to an array of execution steps.
 * 
 * Order of execution demonstrated:
 * 1. Synchronous operations (executed immediately on the call stack)
 * 2. Microtasks (Promise callbacks, executed after current macro task finishes but before next event loop tick)
 * 3. Macrotasks (setTimeout callbacks, executed in a subsequent event loop tick)
 */
export const demonstrateEventLoopOrder = (): Promise<string[]> => {
  return new Promise((resolve) => {
    const executionOrder: string[] = [];

    // 1. Synchronous Code
    executionOrder.push('sync-start');

    // 3. Macrotask (Timer)
    setTimeout(() => {
      executionOrder.push('timer-macrotask');
      // Resolve after the macrotask executes to finish the demonstration
      resolve(executionOrder);
    }, 0);

    // 2. Microtask (Promise)
    Promise.resolve().then(() => {
      executionOrder.push('promise-microtask');
    });

    // 1. Synchronous Code
    executionOrder.push('sync-end');
  });
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

