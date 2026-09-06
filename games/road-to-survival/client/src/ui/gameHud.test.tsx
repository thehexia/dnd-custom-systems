import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import type { Room } from "colyseus.js";

// GameHud only needs getStateCallbacks() to return a stable, permissive object -- the tests below
// exercise initial-render behavior driven by the fake room's state, not live reactivity, so the
// callbacks themselves never need to actually fire.
vi.mock("colyseus.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("colyseus.js")>();
  const permissive = {
    players: { onAdd: () => {}, onRemove: () => {} },
    timeline: { onChange: () => {} },
    onChange: () => {},
  };
  return {
    ...actual,
    getStateCallbacks: () => () => permissive,
  };
});

const { GameHud } = await import("./gameHud.js");

interface FakePlayer {
  sessionId: string;
  username: string;
  isAdmin: boolean;
  ready: boolean;
}

function makeRoom(options: {
  sessionId?: string;
  players?: FakePlayer[];
  timeline?: Partial<{ week: number; segment: number; daysPerWeek: number; phase: string }>;
}): Room {
  const players = new Map((options.players ?? []).map((p) => [p.sessionId, p]));
  return {
    sessionId: options.sessionId ?? "me",
    state: {
      players,
      timeline: { week: 1, segment: 1, daysPerWeek: 5, phase: "active", ...options.timeline },
    },
    send: vi.fn(),
    onMessage: vi.fn(),
  } as unknown as Room;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("active phase", () => {
  it("shows a Ready button and sends 'ready' when clicked", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: true, ready: false }],
    });

    render(<GameHud room={room} />);
    fireEvent.click(screen.getByRole("button", { name: "Ready" }));

    expect(room.send).toHaveBeenCalledWith("ready");
  });

  it("disables the button and lists roster members with their ready state", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [
        { sessionId: "me", username: "alice", isAdmin: true, ready: true },
        { sessionId: "other", username: "bob", isAdmin: false, ready: false },
      ],
    });

    render(<GameHud room={room} />);

    expect((screen.getByRole("button", { name: "Ready!" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("alice")).toBeTruthy();
    expect(screen.getByText("bob")).toBeTruthy();
    const aliceTab = screen.getByText("alice").closest("[data-ready]");
    const bobTab = screen.getByText("bob").closest("[data-ready]");
    expect(aliceTab?.getAttribute("data-ready")).toBe("true");
    expect(bobTab?.getAttribute("data-ready")).toBe("false");
  });
});

describe("week-end phase", () => {
  it("shows resolve buttons for the admin and sends the expected outcome", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: true, ready: false }],
      timeline: { phase: "week-end", segment: 10, week: 1 },
    });

    render(<GameHud room={room} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue to next week" }));
    expect(room.send).toHaveBeenCalledWith("resolve-week-end", { outcome: "continue" });

    fireEvent.click(screen.getByRole("button", { name: "Party dies" }));
    expect(room.send).toHaveBeenCalledWith("resolve-week-end", { outcome: "death" });
  });

  it("shows a waiting message instead of buttons for a non-admin", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "bob", isAdmin: false, ready: false }],
      timeline: { phase: "week-end", segment: 10, week: 1 },
    });

    render(<GameHud room={room} />);

    expect(screen.queryByRole("button", { name: "Continue to next week" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Party dies" })).toBeNull();
    expect(document.querySelector("[data-waiting]")).not.toBeNull();
  });
});

describe("export week rolls", () => {
  it("shows an Export week button for the admin and sends export-week-rolls when clicked", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: true, ready: false }],
    });

    render(<GameHud room={room} />);
    fireEvent.click(screen.getByRole("button", { name: "Export week" }));

    expect(room.send).toHaveBeenCalledWith("export-week-rolls");
  });

  it("does not show an Export week button for a non-admin", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "bob", isAdmin: false, ready: false }],
    });

    render(<GameHud room={room} />);

    expect(screen.queryByRole("button", { name: "Export week" })).toBeNull();
  });

  it("shows an Export week button for the admin during the week-end decision too", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: true, ready: false }],
      timeline: { phase: "week-end", segment: 10, week: 1 },
    });

    render(<GameHud room={room} />);
    fireEvent.click(screen.getByRole("button", { name: "Export week" }));

    expect(room.send).toHaveBeenCalledWith("export-week-rolls");
  });

  it("saves the received markdown as a downloaded file", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: true, ready: false }],
    });

    let deliverResult: ((markdown: string) => void) | undefined;
    (room.onMessage as ReturnType<typeof vi.fn>).mockImplementation((type: string, callback: (markdown: string) => void) => {
      if (type === "export-week-rolls-result") deliverResult = callback;
    });

    const clickSpy = vi.fn();
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const el = realCreateElement(tagName);
      if (tagName === "a") el.click = clickSpy;
      return el;
    });
    const createObjectURL = vi.fn(() => "blob:fake-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    render(<GameHud room={room} />);
    deliverResult?.("# Week 1 Rolls");

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

describe("game-over phase", () => {
  it("shows the game-over view regardless of admin status", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: true, ready: false }],
      timeline: { phase: "game-over", week: 3 },
    });

    render(<GameHud room={room} />);

    expect(document.querySelector("[data-game-over]")).not.toBeNull();
    expect(screen.getByText("Week 3 was the last.")).toBeTruthy();
  });
});
