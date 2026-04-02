/**
 * Thin wrapper around the VS Code webview API.
 *
 * `acquireVsCodeApi()` can only be called once per webview session,
 * so this module caches the reference for reuse across the app.
 */

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

class VsCodeBridge {
  private api: VsCodeApi | null = null;

  private getApi(): VsCodeApi {
    if (!this.api) {
      this.api = acquireVsCodeApi();
    }
    return this.api;
  }

  /** Send a typed message to the extension host. */
  postMessage<T extends { type: string }>(message: T): void {
    this.getApi().postMessage(message);
  }

  /** Retrieve persisted webview state (survives tab switches). */
  getState<T>(): T | undefined {
    return this.getApi().getState() as T | undefined;
  }

  /** Persist webview state. */
  setState<T>(state: T): void {
    this.getApi().setState(state);
  }
}

export const vscode = new VsCodeBridge();
