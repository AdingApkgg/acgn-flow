interface RuffleAPI {
  newest(): {
    createPlayer(): HTMLElement & { load(options: Record<string, unknown>): Promise<void> };
  };
}
export function ensureRuffleLoaded(scriptUrl: string, timeoutMs?: number): Promise<RuffleAPI>;
export function startRufflePlayer(
  container: HTMLElement,
  url: string,
  onReady: () => void,
  onError: (error: unknown) => void,
  timeoutMs?: number,
): () => void;
export function bootFlashFrame(url: string, parentOrigin: string): void;
