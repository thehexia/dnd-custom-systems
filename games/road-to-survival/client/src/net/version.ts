const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "ws://localhost:2567";
const HEALTH_URL = SERVER_URL.replace(/^ws/, "http") + "/health";

const DEFAULT_POLL_INTERVAL_MS = 5000;

export interface WatchForServerUpdatesOptions {
  onUpdateAvailable: () => void;
  /** Called with the server's reported startedAt on every successful check, so callers can show
   * a persistent "server started at X" readout rather than only a conditional warning. */
  onStatusChange?: (startedAt: number) => void;
  pollIntervalMs?: number;
}

/**
 * Polls the server's /health endpoint and fires onUpdateAvailable once it reports a different
 * `startedAt` than the first successful check -- i.e. the server process has restarted (in dev,
 * this happens on every tsx-watch-triggered file change) since this client connected.
 */
export function watchForServerUpdates({
  onUpdateAvailable,
  onStatusChange,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: WatchForServerUpdatesOptions): () => void {
  let knownStartedAt: number | undefined;
  let stopped = false;

  async function check(): Promise<void> {
    try {
      const res = await fetch(HEALTH_URL);
      const data: { startedAt?: unknown } = await res.json();
      if (typeof data.startedAt !== "number") return;

      onStatusChange?.(data.startedAt);

      if (knownStartedAt === undefined) {
        knownStartedAt = data.startedAt;
      } else if (data.startedAt !== knownStartedAt) {
        onUpdateAvailable();
      }
    } catch {
      // Server unreachable (e.g. mid-restart) -- try again on the next poll.
    }
  }

  void check();
  const interval = setInterval(() => {
    if (!stopped) void check();
  }, pollIntervalMs);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
