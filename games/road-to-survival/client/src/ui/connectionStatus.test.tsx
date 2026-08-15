import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { Room } from "colyseus.js";

const mockWatchForServerUpdates = vi.fn();

vi.mock("../net/version", () => ({
  watchForServerUpdates: mockWatchForServerUpdates,
}));

const { ConnectionStatusBanner } = await import("./connectionStatus.js");

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeFakeRoom(): { room: Room; fireLeave: () => void } {
  const handlers: Array<() => void> = [];
  const onLeave = Object.assign(
    (cb: () => void) => {
      handlers.push(cb);
    },
    { remove: (cb: () => void) => handlers.splice(handlers.indexOf(cb), 1) },
  );
  return {
    room: { onLeave } as unknown as Room,
    fireLeave: () => handlers.forEach((cb) => cb()),
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  mockWatchForServerUpdates.mockReset();
});

describe("server status badge", () => {
  it("shows the server's started time once a status check succeeds", async () => {
    let onStatusChange: (startedAt: number) => void = () => {};
    mockWatchForServerUpdates.mockImplementation((opts) => {
      onStatusChange = opts.onStatusChange;
      return () => {};
    });

    render(<ConnectionStatusBanner room={null} />);
    expect(document.querySelector("[data-server-status]")).toBeNull();

    onStatusChange(new Date("2026-01-01T10:15:00").getTime());
    await flush();

    expect(document.querySelector("[data-server-status]")?.textContent).toContain("Server started");
  });

  it("stays visible alongside the disconnected/update banner once both are known", async () => {
    let onStatusChange: (startedAt: number) => void = () => {};
    let onUpdateAvailable: () => void = () => {};
    mockWatchForServerUpdates.mockImplementation((opts) => {
      onStatusChange = opts.onStatusChange;
      onUpdateAvailable = opts.onUpdateAvailable;
      return () => {};
    });

    render(<ConnectionStatusBanner room={null} />);
    onStatusChange(Date.now());
    onUpdateAvailable();
    await flush();

    expect(document.querySelector("[data-server-status]")).not.toBeNull();
    expect(document.querySelector('[data-connection-status="update-available"]')).not.toBeNull();
  });
});

describe("update-available", () => {
  it("renders nothing until watchForServerUpdates reports an update", async () => {
    let onUpdateAvailable: () => void = () => {};
    mockWatchForServerUpdates.mockImplementation((opts) => {
      onUpdateAvailable = opts.onUpdateAvailable;
      return () => {};
    });

    render(<ConnectionStatusBanner room={null} />);
    expect(document.querySelector("[data-connection-status]")).toBeNull();

    onUpdateAvailable();
    await flush();

    expect(document.querySelector('[data-connection-status="update-available"]')).not.toBeNull();
    expect(screen.getByText("A new version of the game is available.")).toBeTruthy();
  });

  it("reloads the page when the Reload button is clicked", async () => {
    let onUpdateAvailable: () => void = () => {};
    mockWatchForServerUpdates.mockImplementation((opts) => {
      onUpdateAvailable = opts.onUpdateAvailable;
      return () => {};
    });
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });

    render(<ConnectionStatusBanner room={null} />);
    onUpdateAvailable();
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("disconnected", () => {
  it("shows a disconnected message when the room unexpectedly leaves", async () => {
    mockWatchForServerUpdates.mockReturnValue(() => {});
    const { room, fireLeave } = makeFakeRoom();

    render(<ConnectionStatusBanner room={room} />);
    expect(document.querySelector("[data-connection-status]")).toBeNull();

    fireLeave();
    await flush();

    expect(document.querySelector('[data-connection-status="disconnected"]')).not.toBeNull();
    expect(screen.getByText("Lost connection to the game server -- it may have restarted.")).toBeTruthy();
  });

  it("does not attach a leave listener when no room is provided yet", () => {
    mockWatchForServerUpdates.mockReturnValue(() => {});
    render(<ConnectionStatusBanner room={null} />);
    expect(document.querySelector("[data-connection-status]")).toBeNull();
  });
});
