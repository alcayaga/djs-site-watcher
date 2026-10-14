/**
 * @module safeCancelable
 * @description Provides a hardened wrapper around 'p-cancelable' to guard against race conditions
 * in libraries like Got v11 where delayed retry routines in Node's timer queue attach cancellation
 * handlers after the promise has already settled.
 */

const OriginalPCancelable = require('p-cancelable');

const SETTLED_ONCANCEL_ERROR_MESSAGE = 'The `onCancel` handler was attached after the promise settled.';

/**
 * Enhanced PCancelable class that gracefully ignores onCancel registrations
 * after the promise has settled rather than throwing an uncaught exception.
 */
class SafePCancelable extends OriginalPCancelable {
    /**
     * Creates a new SafePCancelable promise instance.
     * @param {Function} executor Executor function accepting resolve, reject, and onCancel arguments.
     */
    constructor(executor) {
        super((resolve, reject, onCancel) => {
            /**
              * Intercepts onCancel registrations to avoid crashing if called post-settlement.
              * @param {Function} handler The cancellation handler callback.
              */
            const safeOnCancel = (handler) => {
                try {
                    onCancel(handler);
                } catch (err) {
                    SafePCancelable._handleOnCancelError(err);
                    // If the promise has already settled, run the cleanup handler immediately
                    // so resources (such as late retry requests) are destroyed rather than orphaned.
                    if (typeof handler === 'function') {
                        try {
                            handler();
                        } catch {
                            // Suppress errors during late cleanup execution
                        }
                    }
                }
            };

            Object.defineProperties(safeOnCancel, {
                shouldReject: {
                    /**
                     * Gets whether cancellation should reject the promise.
                     * @returns {boolean} True if cancellation rejects.
                     */
                    get: () => onCancel.shouldReject,
                    /**
                     * Sets whether cancellation should reject the promise.
                     * @param {boolean} boolean Flag indicating rejection behavior.
                     */
                    set: (boolean) => {
                        onCancel.shouldReject = boolean;
                    }
                }
            });

            return executor(resolve, reject, safeOnCancel);
        });
    }

    /**
     * Handles errors thrown during onCancel registration.
     * Gracefully suppresses settled promise errors while rethrowing unrelated errors.
     * @param {Error} err The error to handle.
     */
    static _handleOnCancelError(err) {
        if (err && err.message === SETTLED_ONCANCEL_ERROR_MESSAGE) {
            return;
        }
        throw err;
    }

    /**
     * Converts a function returning a promise into a function returning a SafePCancelable.
     * @param {Function} userFn The function to wrap.
     * @returns {Function} Wrapped function returning a SafePCancelable instance.
     */
    static fn(userFn) {
        return (...arguments_) => {
            return new SafePCancelable(async (resolve, reject, onCancel) => {
                arguments_.push(onCancel);
                try {
                    const result = await userFn(...arguments_);
                    resolve(result);
                } catch (err) {
                    reject(err);
                }
            });
        };
    }
}

// Preserve static methods and properties from OriginalPCancelable
Object.setPrototypeOf(SafePCancelable, OriginalPCancelable);
SafePCancelable.CancelError = OriginalPCancelable.CancelError;

/**
 * Note on module load order:
 * SafePCancelable patches require.cache for 'p-cancelable'. For this patch to affect
 * third-party libraries (specifically `got`), this module MUST be required before `got`
 * is imported (e.g., at the very top of application entry points such as `src/bot.js`).
 * Got loads `p-cancelable` synchronously via `require('p-cancelable')` at module initialization time.
 */
const pathsToPatch = new Set();
try {
    pathsToPatch.add(require.resolve('p-cancelable'));
} catch {
    // Top-level p-cancelable not resolvable
}

try {
    // Ensure Got's nested or sibling p-cancelable dependency is targeted
    pathsToPatch.add(require.resolve('p-cancelable', { paths: [require.resolve('got')] }));
} catch {
    // Got not installed or does not declare p-cancelable
}

for (const modulePath of pathsToPatch) {
    try {
        require(modulePath);
        if (require.cache[modulePath]) {
            require.cache[modulePath].exports = SafePCancelable;
        }
    } catch {
        // Ignore unresolvable path entries
    }
}

module.exports = SafePCancelable;
