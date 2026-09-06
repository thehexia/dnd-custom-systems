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
  skipVote?: boolean;
  leadTokens?: number;
}

function makeRoom(options: {
  sessionId?: string;
  players?: FakePlayer[];
  timeline?: Partial<{
    week: number;
    segment: number;
    daysPerWeek: number;
    phase: string;
    mode: string;
    skipConfirmationAvailable: boolean;
    leadTokenAssignmentAvailable: boolean;
    currentSegmentHasActiveVote: boolean;
  }>;
}): Room {
  const players = new Map(
    (options.players ?? []).map((p) => [
      p.sessionId,
      { skipVote: false, leadTokens: 0, ...p },
    ]),
  );
  return {
    sessionId: options.sessionId ?? "me",
    state: {
      players,
      timeline: {
        week: 1,
        segment: 1,
        daysPerWeek: 5,
        phase: "active",
        mode: "normal",
        skipConfirmationAvailable: false,
        leadTokenAssignmentAvailable: false,
        currentSegmentHasActiveVote: false,
        ...options.timeline,
      },
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

describe("Hunted Mode toggle", () => {
  it("shows an admin-only control that enables hunted mode", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: true, ready: false }],
    });

    render(<GameHud room={room} />);
    fireEvent.click(screen.getByRole("button", { name: "Enable Hunted Mode" }));

    expect(room.send).toHaveBeenCalledWith("set-mode", { mode: "hunted" });
  });

  it("switches back to normal mode from a hunted room", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: true, ready: false }],
      timeline: { mode: "hunted" },
    });

    render(<GameHud room={room} />);
    fireEvent.click(screen.getByRole("button", { name: "Disable Hunted Mode" }));

    expect(room.send).toHaveBeenCalledWith("set-mode", { mode: "normal" });
  });

  it("is not shown to a non-admin", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "bob", isAdmin: false, ready: false }],
    });

    render(<GameHud room={room} />);

    expect(screen.queryByRole("button", { name: "Enable Hunted Mode" })).toBeNull();
  });

  it("is available to the admin during the week-end and game-over views too", () => {
    const weekEndRoom = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: true, ready: false }],
      timeline: { phase: "week-end", segment: 10, week: 1 },
    });
    render(<GameHud room={weekEndRoom} />);
    expect(screen.getByRole("button", { name: "Enable Hunted Mode" })).toBeTruthy();
    document.body.innerHTML = "";

    const gameOverRoom = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: true, ready: false }],
      timeline: { phase: "game-over", week: 3 },
    });
    render(<GameHud room={gameOverRoom} />);
    expect(screen.getByRole("button", { name: "Enable Hunted Mode" })).toBeTruthy();
  });
});

describe("Hunted Mode Forced March vote", () => {
  it("shows a Forced March control with the current tally (excluding the admin) and sends vote-skip when clicked", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [
        { sessionId: "admin", username: "admin", isAdmin: true, ready: false, skipVote: false },
        { sessionId: "me", username: "alice", isAdmin: false, ready: false, skipVote: false },
        { sessionId: "other", username: "bob", isAdmin: false, ready: false, skipVote: true },
      ],
      timeline: { mode: "hunted" },
    });

    render(<GameHud room={room} />);
    const button = screen.getByRole("button", { name: "Forced March (1/2)" });
    fireEvent.click(button);

    expect(room.send).toHaveBeenCalledWith("vote-skip");
  });

  it("disables the control once the local player has already voted", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: false, ready: false, skipVote: true }],
      timeline: { mode: "hunted" },
    });

    render(<GameHud room={room} />);

    expect((screen.getByRole("button", { name: "Marching! (1/1)" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("is not shown while the room is in normal mode", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: false, ready: false }],
    });

    render(<GameHud room={room} />);

    expect(screen.queryByRole("button", { name: /Forced March/ })).toBeNull();
  });

  it("disables the control for the admin, with an explanatory message, and never sends vote-skip", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: true, ready: false }],
      timeline: { mode: "hunted" },
    });

    render(<GameHud room={room} />);

    const button = screen.getByRole("button", { name: "Marching! (0/0)" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("The admin doesn't vote on the Forced March.")).toBeTruthy();
  });

  it("disables the control for a non-admin, with an explanatory message, while a skill-check vote is active on the current segment", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: false, ready: false }],
      timeline: { mode: "hunted", currentSegmentHasActiveVote: true },
    });

    render(<GameHud room={room} />);

    const button = screen.getByRole("button", { name: "Marching! (0/1)" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Someone has already voted to roll a check this segment.")).toBeTruthy();
  });
});

describe("Hunted Mode Forced March confirmation", () => {
  it("lets the admin confirm once a majority is reached, and disables it otherwise", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: true, ready: false }],
      timeline: { mode: "hunted", skipConfirmationAvailable: true },
    });

    render(<GameHud room={room} />);
    fireEvent.click(screen.getByRole("button", { name: "Confirm Forced March" }));

    expect(room.send).toHaveBeenCalledWith("confirm-skip");
  });

  it("disables the control when no majority is awaiting confirmation", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: true, ready: false }],
      timeline: { mode: "hunted", skipConfirmationAvailable: false },
    });

    render(<GameHud room={room} />);

    expect((screen.getByRole("button", { name: "Confirm Forced March" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("is not shown to a non-admin", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "bob", isAdmin: false, ready: false }],
      timeline: { mode: "hunted", skipConfirmationAvailable: true },
    });

    render(<GameHud room={room} />);

    expect(screen.queryByRole("button", { name: "Confirm Forced March" })).toBeNull();
  });
});

describe("Hunted Mode Lead token assignment", () => {
  it("lets the admin assign Lead tokens once available, and disables it otherwise", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: true, ready: false }],
      timeline: { mode: "hunted", leadTokenAssignmentAvailable: true },
    });

    render(<GameHud room={room} />);
    fireEvent.click(screen.getByRole("button", { name: "Assign Lead Tokens" }));

    expect(room.send).toHaveBeenCalledWith("assign-lead-tokens");
  });

  it("disables the control when no assignment is available", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: true, ready: false }],
      timeline: { mode: "hunted", leadTokenAssignmentAvailable: false },
    });

    render(<GameHud room={room} />);

    expect((screen.getByRole("button", { name: "Assign Lead Tokens" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("is not shown to a non-admin", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "bob", isAdmin: false, ready: false }],
      timeline: { mode: "hunted", leadTokenAssignmentAvailable: true },
    });

    render(<GameHud room={room} />);

    expect(screen.queryByRole("button", { name: "Assign Lead Tokens" })).toBeNull();
  });

  it("is available to the admin during the week-end view too", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [{ sessionId: "me", username: "alice", isAdmin: true, ready: false }],
      timeline: { phase: "week-end", segment: 10, week: 1, mode: "hunted", leadTokenAssignmentAvailable: true },
    });

    render(<GameHud room={room} />);
    fireEvent.click(screen.getByRole("button", { name: "Assign Lead Tokens" }));

    expect(room.send).toHaveBeenCalledWith("assign-lead-tokens");
  });
});

describe("Lead token roster indicator", () => {
  it("shows a count badge for a player holding Lead tokens, and none for a player without any", () => {
    const room = makeRoom({
      sessionId: "me",
      players: [
        { sessionId: "me", username: "alice", isAdmin: true, ready: false, leadTokens: 2 },
        { sessionId: "other", username: "bob", isAdmin: false, ready: false, leadTokens: 0 },
      ],
      timeline: { mode: "hunted" },
    });

    render(<GameHud room={room} />);

    const aliceTab = screen.getByText("alice").closest("[data-lead-tokens]");
    const bobTab = screen.getByText("bob").closest("[data-lead-tokens]");
    expect(aliceTab?.getAttribute("data-lead-tokens")).toBe("2");
    expect(bobTab?.getAttribute("data-lead-tokens")).toBe("0");
    expect(aliceTab?.querySelector("[data-lead-token-badge]")?.textContent).toContain("2");
    expect(bobTab?.querySelector("[data-lead-token-badge]")).toBeNull();
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
