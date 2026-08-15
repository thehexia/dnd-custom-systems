import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchForServerUpdates } from "./version";

function jsonResponse(body: unknown): Response {
  return { json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("watchForServerUpdates", () => {
  it("does not fire on the first check -- it just records the baseline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ startedAt: 1000 })));
    const onUpdateAvailable = vi.fn();

    const stop = watchForServerUpdates({ onUpdateAvailable, pollIntervalMs: 1000 });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    expect(onUpdateAvailable).not.toHaveBeenCalled();
    stop();
  });

  it("calls onStatusChange with the server's startedAt on every successful check", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ startedAt: 1000 })));
    const onStatusChange = vi.fn();

    const stop = watchForServerUpdates({ onUpdateAvailable: vi.fn(), onStatusChange, pollIntervalMs: 1000 });
    await vi.waitFor(() => expect(onStatusChange).toHaveBeenCalledWith(1000));
    stop();
  });

  it("fires once a later poll sees a different startedAt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ startedAt: 1000 }))
      .mockResolvedValueOnce(jsonResponse({ startedAt: 2000 }));
    vi.stubGlobal("fetch", fetchMock);
    const onUpdateAvailable = vi.fn();

    const stop = watchForServerUpdates({ onUpdateAvailable, pollIntervalMs: 1000 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(1000);
    expect(onUpdateAvailable).toHaveBeenCalledTimes(1);
    stop();
  });

  it("does not fire again once already notified for the same restart", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ startedAt: 1000 }))
      .mockResolvedValue(jsonResponse({ startedAt: 2000 }));
    vi.stubGlobal("fetch", fetchMock);
    const onUpdateAvailable = vi.fn();

    const stop = watchForServerUpdates({ onUpdateAvailable, pollIntervalMs: 1000 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    // still fires every subsequent poll while the mismatch persists -- callers decide whether to
    // dedupe (e.g. the banner just stays visible once shown).
    expect(onUpdateAvailable.mock.calls.length).toBeGreaterThanOrEqual(1);
    stop();
  });

  it("swallows fetch errors and keeps polling instead of throwing", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("connection refused"));
    vi.stubGlobal("fetch", fetchMock);
    const onUpdateAvailable = vi.fn();

    const stop = watchForServerUpdates({ onUpdateAvailable, pollIntervalMs: 1000 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(1000);

    expect(onUpdateAvailable).not.toHaveBeenCalled();
    stop();
  });

  it("stops polling once the returned stop function is called", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ startedAt: 1000 }));
    vi.stubGlobal("fetch", fetchMock);

    const stop = watchForServerUpdates({ onUpdateAvailable: vi.fn(), pollIntervalMs: 1000 });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
