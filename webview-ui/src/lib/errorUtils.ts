/**
 * Browser/webview helpers for values caught at `catch` boundaries (parity with extension host `src/shared/utils/errorUtils.ts`).
 */

/**
 * Formats a caught value for console logging or inline UI (never assumes `Error`).
 *
 * @param err - Value from `catch (err: unknown)` or a rejection reason.
 * @returns Human-readable diagnostic string.
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
 */
export function asError(err: unknown): Error | undefined {
  return err instanceof Error ? err : undefined;
}

/**
 * Short one-line message for UI (avoids dumping stacks in toasts).
 *
 * @param err - Caught value.
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
