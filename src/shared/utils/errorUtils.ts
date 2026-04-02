/**
 * Utilities for handling values caught at `catch` boundaries in a type-safe way.
 */

/**
 * Formats a caught value for logs or UI without assuming it is an `Error`.
 *
 * @param err - Value from `catch (err: unknown)` or a rejection reason.
 * @returns A stable, human-readable string (never empty for typical throws).
 */
export function formatUnknownError(err: unknown): string {
    if (err instanceof Error) {
        return err.stack ?? err.message;
    }
    if (typeof err === 'string') {
        return err;
    }
    if (err === null || err === undefined) {
        return String(err);
    }
    try {
        return JSON.stringify(err);
    } catch {
        return String(err);
    }
}

/**
 * Narrows a caught value to `Error` when possible.
 *
 * @param err - Value from a catch clause.
 * @returns The same reference if it is an `Error`; otherwise `undefined`.
 */
export function asError(err: unknown): Error | undefined {
    return err instanceof Error ? err : undefined;
}

/**
 * Short text for toast dialogs; avoids dumping stack traces or JSON blobs.
 *
 * @param err - Caught value.
 * @returns One-line message suitable for `showErrorMessage`.
 */
export function messageForUser(err: unknown): string {
    if (err instanceof Error) {
        return err.message;
    }
    if (typeof err === 'string') {
        return err;
    }
    return 'An unexpected error occurred.';
}
