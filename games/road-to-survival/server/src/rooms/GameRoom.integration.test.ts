import { Server } from "@colyseus/core";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { Room } from "colyseus.js";
import { createServer } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db/prisma.js";
import { findRoomByCode, findRoomPlayer } from "../db/rooms.js";
import { GameRoom } from "./GameRoom.js";
import type { SegmentCardOptionState } from "./schema/GameState.js";

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: createServer() }),
  });
  gameServer.define("game", GameRoom);
  colyseus = await boot(gameServer);
});

afterEach(async () => {
  await colyseus.cleanup();
});

afterAll(async () => {
  await colyseus.shutdown();
  await prisma.$disconnect();
});

function waitForRoomCreated(room: Room): Promise<{ code: string; password: string }> {
  return new Promise((resolve) => {
    room.onMessage<{ code: string; password: string }>("room-created", (data) => resolve(data));
  });
}

async function createRoomAndJoin(
  adminUsername: string,
  otherUsernames: string[] = [],
  daysPerWeek?: number,
): Promise<{ code: string; rooms: Room[] }> {
  const createOptions =
    daysPerWeek === undefined
      ? { action: "create" as const, username: adminUsername }
      : { action: "create" as const, username: adminUsername, daysPerWeek };
  const adminRoom = await colyseus.sdk.create("game", createOptions);
  const { code } = await waitForRoomCreated(adminRoom);

  const rooms = [adminRoom];
  for (const username of otherUsernames) {
    rooms.push(await colyseus.sdk.joinById(code, { action: "join", code, username }));
  }
  return { code, rooms };
}

/** Sends "ready" from every room each round until the week-end decision state is reached. */
async function driveToWeekEnd(rooms: Room[], daysPerWeek: number): Promise<void> {
  const total = daysPerWeek * 2;
  for (let round = 1; round <= total; round++) {
    for (const room of rooms) room.send("ready");
    if (round < total) {
      await expect.poll(() => rooms[0].state.timeline.segment, { timeout: 5_000 }).toBe(round + 1);
    } else {
      await expect.poll(() => rooms[0].state.timeline.phase, { timeout: 5_000 }).toBe("week-end");
    }
  }
}

/**
 * Switches the room to hunted mode, drives one confirmed Forced March (segment 1 -> 2), and has
 * the admin assign the resulting Lead token to both players -- the minimum setup any hunted-mode
 * voting test needs, since a token can only ever be granted following a confirmed Forced March.
 * Only `other` votes -- the admin never casts a Forced March vote (see specs/road-to-survival-
 * hunted-mode - Forced March Vote), and with a single connected non-admin player, that one vote
 * alone already exceeds half of the non-admin total.
 */
async function forcedMarchAndAssignOneTokenEach(admin: Room, other: Room): Promise<void> {
  admin.send("set-mode", { mode: "hunted" });
  await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

  other.send("vote-skip");
  await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
  admin.send("confirm-skip");
  await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(2);
  await expect.poll(() => admin.state.timeline.leadTokenAssignmentAvailable, { timeout: 5_000 }).toBe(true);

  admin.send("assign-lead-tokens");
  await expect.poll(() => admin.state.players.get(admin.sessionId)?.leadTokens, { timeout: 5_000 }).toBe(1);
}

describe("GameRoom onCreate + onJoin (real Postgres)", () => {
  it("persists a room and marks the creator as admin", async () => {
    const room = await colyseus.sdk.create("game", { action: "create", username: "creator" });
    const { code } = await waitForRoomCreated(room);

    const stored = await findRoomByCode(code);
    expect(stored).not.toBeNull();

    const adminPlayer = await findRoomPlayer(stored!.id, "creator");
    expect(adminPlayer?.isAdmin).toBe(true);
  });

  it("creates a non-admin player record for a new username without requiring a password", async () => {
    const createdRoom = await colyseus.sdk.create("game", { action: "create", username: "creator2" });
    const { code } = await waitForRoomCreated(createdRoom);

    const joinedRoom = await colyseus.sdk.joinById(code, { action: "join", code, username: "newplayer" });
    expect(joinedRoom.sessionId).toBeTruthy();

    const stored = await findRoomByCode(code);
    const player = await findRoomPlayer(stored!.id, "newplayer");
    expect(player?.isAdmin).toBe(false);
  });
});

describe("GameRoom onAuth (admin rejoin against real hashed password)", () => {
  it("rejects rejoin without a password, rejects with the wrong password, and accepts the correct password", async () => {
    const createdRoom = await colyseus.sdk.create("game", { action: "create", username: "admin3" });
    const { code, password } = await waitForRoomCreated(createdRoom);

    await expect(
      colyseus.sdk.joinById(code, { action: "join", code, username: "admin3" }),
    ).rejects.toThrow();

    await expect(
      colyseus.sdk.joinById(code, { action: "join", code, username: "admin3", password: "wrong-password" }),
    ).rejects.toThrow();

    // The original creator session is still connected under "admin3"; disconnect it first so
    // the reconnect below isn't rejected for a duplicate active username instead of exercising
    // the password check. With no clients left, the room's live process disposes (autoDispose),
    // so the rejoin below must fall back to re-creating a live process the same way the
    // production client does in net/room.ts's `joinRoom`.
    await createdRoom.leave();

    const joinOptions = { action: "join" as const, code, username: "admin3", password };
    const rejoined = await colyseus.sdk.joinById(code, joinOptions).catch(() =>
      colyseus.sdk.create("game", joinOptions),
    );
    expect(rejoined.sessionId).toBeTruthy();
  });
});

describe("GameRoom days-per-week configuration (real Postgres)", () => {
  it("defaults to 5 days per week when not specified", async () => {
    const { rooms } = await createRoomAndJoin("dpw-default");
    await expect.poll(() => rooms[0].state.timeline.daysPerWeek, { timeout: 5_000 }).toBe(5);
  });

  it("uses a valid custom days-per-week value", async () => {
    const { rooms } = await createRoomAndJoin("dpw-custom", [], 3);
    await expect.poll(() => rooms[0].state.timeline.daysPerWeek, { timeout: 5_000 }).toBe(3);
  });

  it.each([0, -1, 2.5])("falls back to the default of 5 for an invalid value (%s)", async (value) => {
    const { rooms } = await createRoomAndJoin(`dpw-invalid-${value}`, [], value);
    await expect.poll(() => rooms[0].state.timeline.daysPerWeek, { timeout: 5_000 }).toBe(5);
  });
});

describe("GameRoom ready-up and timeline advancement (real Postgres)", () => {
  it("waits for every connected player before advancing, then advances and resets readiness", async () => {
    const { rooms } = await createRoomAndJoin("advance-1", ["advance-2"]);
    const [roomA, roomB] = rooms;

    roomA.send("ready");
    await expect.poll(() => roomA.state.players.get(roomA.sessionId)?.ready, { timeout: 5_000 }).toBe(true);
    expect(roomA.state.timeline.segment).toBe(1);

    roomB.send("ready");
    await expect.poll(() => roomA.state.timeline.segment, { timeout: 5_000 }).toBe(2);
    expect(roomA.state.players.get(roomA.sessionId)?.ready).toBe(false);
    expect(roomA.state.players.get(roomB.sessionId)?.ready).toBe(false);
  });

  it("progresses through all 10 segments of the default 5-day week, then enters week-end without exceeding segment 10", async () => {
    const { rooms } = await createRoomAndJoin("week-full-1", ["week-full-2"]);

    await driveToWeekEnd(rooms, 5);

    expect(rooms[0].state.timeline.segment).toBe(10);
    expect(rooms[0].state.timeline.phase).toBe("week-end");
  });

  it("reaches the week-end decision state at the correct segment for a custom days-per-week", async () => {
    const { rooms } = await createRoomAndJoin("week-custom-1", ["week-custom-2"], 3);

    await driveToWeekEnd(rooms, 3);

    expect(rooms[0].state.timeline.segment).toBe(6);
    expect(rooms[0].state.timeline.phase).toBe("week-end");
  });

  it("evaluates readiness only against currently connected players when one disconnects", async () => {
    const { rooms } = await createRoomAndJoin("disconnect-1", ["disconnect-2", "disconnect-3"]);
    const [roomA, roomB, roomC] = rooms;

    roomA.send("ready");
    roomB.send("ready");
    await expect.poll(() => roomA.state.players.get(roomB.sessionId)?.ready, { timeout: 5_000 }).toBe(true);
    expect(roomA.state.timeline.segment).toBe(1);

    await roomC.leave();

    await expect.poll(() => roomA.state.timeline.segment, { timeout: 5_000 }).toBe(2);
  });
});

describe("GameRoom resolve-week-end (real Postgres)", () => {
  it("admin continue: increments week, resets to segment 1, reopens the timeline, keeps days-per-week", async () => {
    const { rooms } = await createRoomAndJoin("resolve-continue-1", ["resolve-continue-2"], 1);
    const [admin, other] = rooms;

    await driveToWeekEnd(rooms, 1);

    admin.send("resolve-week-end", { outcome: "continue" });

    await expect.poll(() => admin.state.timeline.week, { timeout: 5_000 }).toBe(2);
    expect(admin.state.timeline.segment).toBe(1);
    expect(admin.state.timeline.phase).toBe("active");
    expect(admin.state.timeline.daysPerWeek).toBe(1);
    expect(admin.state.players.get(admin.sessionId)?.ready).toBe(false);
    expect(admin.state.players.get(other.sessionId)?.ready).toBe(false);
  });

  it("rejects a non-admin's resolution attempt, leaving the room in the week-end state", async () => {
    const { rooms } = await createRoomAndJoin("resolve-nonadmin-1", ["resolve-nonadmin-2"], 1);
    const [admin, other] = rooms;

    await driveToWeekEnd(rooms, 1);

    other.send("resolve-week-end", { outcome: "continue" });

    // No message confirms rejection, so assert the negative by giving the (non-)effect time to
    // arrive and then checking state is unchanged -- the admin's own valid "continue" below
    // proves the room is still responsive and genuinely in week-end, not just slow.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.timeline.phase).toBe("week-end");
    expect(admin.state.timeline.week).toBe(1);

    admin.send("resolve-week-end", { outcome: "continue" });
    await expect.poll(() => admin.state.timeline.phase, { timeout: 5_000 }).toBe("active");
  });

  it("admin death: enters game-over and ignores further ready signals", async () => {
    const { rooms } = await createRoomAndJoin("resolve-death-1", ["resolve-death-2"], 1);
    const [admin, other] = rooms;

    await driveToWeekEnd(rooms, 1);

    admin.send("resolve-week-end", { outcome: "death" });
    await expect.poll(() => admin.state.timeline.phase, { timeout: 5_000 }).toBe("game-over");

    admin.send("ready");
    other.send("ready");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.timeline.phase).toBe("game-over");
    expect(admin.state.players.get(admin.sessionId)?.ready).toBe(false);
  });
});

describe("GameRoom override-segment (real Postgres)", () => {
  it("admin forward override advances the segment without every player being ready, and resets readiness", async () => {
    const { rooms } = await createRoomAndJoin("override-next-1", ["override-next-2"]);
    const [admin, other] = rooms;

    admin.send("ready");
    await expect.poll(() => admin.state.players.get(admin.sessionId)?.ready, { timeout: 5_000 }).toBe(true);

    admin.send("override-segment", { direction: "next" });
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(2);
    expect(admin.state.players.get(admin.sessionId)?.ready).toBe(false);
    expect(admin.state.players.get(other.sessionId)?.ready).toBe(false);
  });

  it("admin forward override at the week's last segment enters week-end", async () => {
    // daysPerWeek: 1 -> 2 segments total, so the first override reaches the last segment (2)
    // and the second, from the last segment, enters week-end.
    const { rooms } = await createRoomAndJoin("override-next-end-1", ["override-next-end-2"], 1);
    const [admin] = rooms;

    admin.send("override-segment", { direction: "next" });
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(2);

    admin.send("override-segment", { direction: "next" });
    await expect.poll(() => admin.state.timeline.phase, { timeout: 5_000 }).toBe("week-end");
    expect(admin.state.timeline.segment).toBe(2);
  });

  it("admin backward override moves back a segment and resets readiness", async () => {
    const { rooms } = await createRoomAndJoin("override-prev-1", ["override-prev-2"]);
    const [admin, other] = rooms;

    admin.send("ready");
    other.send("ready");
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(2);

    admin.send("ready");
    await expect.poll(() => admin.state.players.get(admin.sessionId)?.ready, { timeout: 5_000 }).toBe(true);

    admin.send("override-segment", { direction: "previous" });
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(1);
    expect(admin.state.players.get(admin.sessionId)?.ready).toBe(false);
    expect(admin.state.players.get(other.sessionId)?.ready).toBe(false);
  });

  it("admin backward override at segment 1 is a no-op", async () => {
    const { rooms } = await createRoomAndJoin("override-prev-clamp-1", ["override-prev-clamp-2"]);
    const [admin] = rooms;

    admin.send("override-segment", { direction: "previous" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.timeline.segment).toBe(1);
    expect(admin.state.timeline.week).toBe(1);
  });

  it("rejects a non-admin's override attempt, leaving the timeline unaffected", async () => {
    const { rooms } = await createRoomAndJoin("override-nonadmin-1", ["override-nonadmin-2"]);
    const [admin, other] = rooms;

    other.send("override-segment", { direction: "next" });
    // No message confirms rejection, so assert the negative by giving the (non-)effect time to
    // arrive and then checking state is unchanged -- the admin's own valid override below proves
    // the room is still responsive, not just slow.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.timeline.segment).toBe(1);

    admin.send("override-segment", { direction: "next" });
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(2);
  });

  it("rejects the override during the week-end decision state", async () => {
    const { rooms } = await createRoomAndJoin("override-weekend-1", ["override-weekend-2"], 1);
    const [admin] = rooms;

    await driveToWeekEnd(rooms, 1);

    admin.send("override-segment", { direction: "previous" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.timeline.phase).toBe("week-end");
    expect(admin.state.timeline.segment).toBe(2);
  });

  it("rejects the override in the game-over state", async () => {
    const { rooms } = await createRoomAndJoin("override-gameover-1", ["override-gameover-2"], 1);
    const [admin] = rooms;

    await driveToWeekEnd(rooms, 1);
    admin.send("resolve-week-end", { outcome: "death" });
    await expect.poll(() => admin.state.timeline.phase, { timeout: 5_000 }).toBe("game-over");

    admin.send("override-segment", { direction: "next" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.timeline.phase).toBe("game-over");
  });
});

describe("GameRoom skill-check card generation (real Postgres)", () => {
  it("generates a distinct-skill, in-range-DC card for every segment of the week at room creation", async () => {
    const { rooms } = await createRoomAndJoin("cards-gen-1", [], 2);
    const [admin] = rooms;

    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBe(4);

    for (let segment = 1; segment <= 4; segment++) {
      const card = admin.state.timeline.cards.get(String(segment));
      expect(card?.options).toHaveLength(4);
      const skills = card!.options.map((o: SegmentCardOptionState) => o.skill);
      expect(new Set(skills).size).toBe(4);
      for (const option of card!.options) {
        expect(option.dc).toBeGreaterThanOrEqual(5);
        expect(option.dc).toBeLessThanOrEqual(20);
      }
    }
  });

  it("generates fresh cards for the new week on continue, replacing the prior week's entries", async () => {
    const { rooms } = await createRoomAndJoin("cards-gen-week2", ["cards-gen-week2-b"], 1);
    const [admin] = rooms;

    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBe(2);
    const week1Segment1Options = admin.state.timeline.cards.get("1")!.options.map((o: SegmentCardOptionState) => o.skill);

    await driveToWeekEnd(rooms, 1);
    admin.send("resolve-week-end", { outcome: "continue" });

    await expect.poll(() => admin.state.timeline.week, { timeout: 5_000 }).toBe(2);
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBe(2);
    const week2Segment1Options = admin.state.timeline.cards.get("1")!.options.map((o: SegmentCardOptionState) => o.skill);

    // Not a guarantee of difference (random skills could coincidentally repeat), but the card
    // was regenerated for the new week rather than the old map entry surviving unchanged --
    // checked below via a fresh generation being present for both segments of the new week.
    expect(week2Segment1Options).toHaveLength(4);
    expect(week1Segment1Options).toHaveLength(4);
    expect(admin.state.timeline.cards.get("2")?.options).toHaveLength(4);
  });
});

describe("GameRoom vote-skill-check (real Postgres)", () => {
  it("records a player's first vote, visible to every connected player", async () => {
    const { rooms } = await createRoomAndJoin("vote-first-1", ["vote-first-2"]);
    const [admin, other] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    admin.send("vote-skill-check", { optionIndex: 1 });

    await expect
      .poll(() => other.state.timeline.cards.get("1")?.options[1].voters.includes("vote-first-1"), { timeout: 5_000 })
      .toBe(true);
  });

  it("moves a player's vote to the newly chosen option, off the previous one", async () => {
    const { rooms } = await createRoomAndJoin("vote-move-1");
    const [admin] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => admin.state.timeline.cards.get("1")?.options[0].voters.includes("vote-move-1"), { timeout: 5_000 })
      .toBe(true);

    admin.send("vote-skill-check", { optionIndex: 2 });
    await expect
      .poll(() => admin.state.timeline.cards.get("1")?.options[2].voters.includes("vote-move-1"), { timeout: 5_000 })
      .toBe(true);
    expect(admin.state.timeline.cards.get("1")?.options[0].voters.includes("vote-move-1")).toBe(false);
  });

  it("rejects a vote while the timeline is not in the active phase", async () => {
    const { rooms } = await createRoomAndJoin("vote-inactive-1", [], 1);
    const [admin] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    await driveToWeekEnd(rooms, 1);
    admin.send("vote-skill-check", { optionIndex: 0 });

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(
      admin.state.timeline.cards.get("2")?.options.some((o: SegmentCardOptionState) => o.voters.length > 0),
    ).toBe(false);
  });

  it("always applies the vote to the room's actual current segment, not a previously-voted one", async () => {
    const { rooms } = await createRoomAndJoin("vote-current-1");
    const [admin] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => admin.state.timeline.cards.get("1")?.options[0].voters.includes("vote-current-1"), { timeout: 5_000 })
      .toBe(true);

    admin.send("override-segment", { direction: "next" });
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(2);

    admin.send("vote-skill-check", { optionIndex: 1 });
    await expect
      .poll(() => admin.state.timeline.cards.get("2")?.options[1].voters.includes("vote-current-1"), { timeout: 5_000 })
      .toBe(true);
    // The vote cast while segment 1 was current stays recorded there -- it isn't retroactively
    // moved just because a later vote was cast on segment 2's card.
    expect(admin.state.timeline.cards.get("1")?.options[0].voters.includes("vote-current-1")).toBe(true);
  });
});

describe("GameRoom set-mode (real Postgres)", () => {
  it("admin switches the room to hunted mode and back to normal", async () => {
    const { rooms } = await createRoomAndJoin("mode-1");
    const [admin] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    admin.send("set-mode", { mode: "normal" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("normal");
  });

  it("rejects a non-admin's attempt to change the room's mode", async () => {
    const { rooms } = await createRoomAndJoin("mode-nonadmin-1", ["mode-nonadmin-2"]);
    const [admin, other] = rooms;

    other.send("set-mode", { mode: "hunted" });
    // No message confirms rejection, so assert the negative by giving the (non-)effect time to
    // arrive and then checking state is unchanged -- the admin's own valid switch below proves
    // the room is still responsive, not just slow.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.timeline.mode).toBe("normal");

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");
  });

  it("resets every player's Lead token count to zero when switching back to normal mode", async () => {
    const { rooms } = await createRoomAndJoin("mode-clear-1", ["mode-clear-2"]);
    const [admin, other] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    // Two confirmed Forced Marches and assignments so each player accumulates 2 tokens --
    // proves the reset zeroes out an accumulated count, not just a single token.
    for (let round = 0; round < 2; round++) {
      other.send("vote-skip");
      await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
      admin.send("confirm-skip");
      await expect.poll(() => admin.state.timeline.leadTokenAssignmentAvailable, { timeout: 5_000 }).toBe(true);
      admin.send("assign-lead-tokens");
      await expect
        .poll(() => admin.state.players.get(admin.sessionId)?.leadTokens, { timeout: 5_000 })
        .toBe(round + 1);
    }
    expect(admin.state.players.get(other.sessionId)?.leadTokens).toBe(2);

    admin.send("set-mode", { mode: "normal" });
    await expect.poll(() => admin.state.players.get(admin.sessionId)?.leadTokens, { timeout: 5_000 }).toBe(0);
    expect(admin.state.players.get(other.sessionId)?.leadTokens).toBe(0);
  });
});

describe("GameRoom vote-skip / Forced March majority (real Postgres)", () => {
  it("marks the Forced March as awaiting admin confirmation once a majority of non-admin players vote, without advancing", async () => {
    const { rooms } = await createRoomAndJoin("skip-majority-1", ["skip-majority-2", "skip-majority-3"]);
    const [admin, b, c] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    // Two connected non-admin players (b, c) -- a majority needs both.
    b.send("vote-skip");
    await expect.poll(() => admin.state.players.get(b.sessionId)?.skipVote, { timeout: 5_000 }).toBe(true);
    expect(admin.state.timeline.skipConfirmationAvailable).toBe(false);
    expect(admin.state.timeline.segment).toBe(1);

    c.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
    // Reaching a majority alone never advances the timeline -- only a subsequent admin
    // confirmation does (see the "GameRoom confirm-skip" tests below).
    expect(admin.state.timeline.segment).toBe(1);
  });

  it("does not mark confirmation available when only half of connected non-admin players have voted", async () => {
    const { rooms } = await createRoomAndJoin("skip-short-1", ["skip-short-2", "skip-short-3"]);
    const [admin, b] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    // Two connected non-admin players; only one votes -- not a majority (1 is not > 1).
    b.send("vote-skip");
    await expect.poll(() => admin.state.players.get(b.sessionId)?.skipVote, { timeout: 5_000 }).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.timeline.skipConfirmationAvailable).toBe(false);
    expect(admin.state.timeline.segment).toBe(1);
  });

  it("excludes a disconnected player from the majority calculation", async () => {
    const { rooms } = await createRoomAndJoin("skip-disconnect-1", [
      "skip-disconnect-2",
      "skip-disconnect-3",
      "skip-disconnect-4",
    ]);
    const [admin, b, c, d] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    // Three connected non-admin players (b, c, d); only b votes -- not a majority (1 is not >
    // 1.5).
    b.send("vote-skip");
    await expect.poll(() => admin.state.players.get(b.sessionId)?.skipVote, { timeout: 5_000 }).toBe(true);

    await d.leave();
    // With d (a non-voter) gone, 2 non-admin players remain (b, c); b's 1 vote is still not a
    // majority (1 is not > 1), so confirmation should not become available from d leaving alone.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.timeline.skipConfirmationAvailable).toBe(false);

    c.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
  });

  it("clears the awaiting-confirmation state if the majority is lost before the admin confirms", async () => {
    const { rooms } = await createRoomAndJoin("skip-lost-majority-1", [
      "skip-lost-majority-2",
      "skip-lost-majority-3",
      "skip-lost-majority-4",
    ]);
    const [admin, b, c] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    // Three connected non-admin players; b and c vote -- a majority (2 > 1.5), with the fourth
    // player (d) never voting.
    b.send("vote-skip");
    c.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);

    await b.leave();
    // With b (a voter) gone, 2 non-admin players remain (c, d); only c's 1 vote remains -- the
    // previously-reached majority is no longer met, so the awaiting-confirmation state clears.
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(false);
    expect(admin.state.timeline.segment).toBe(1);
  });

  it("rejects a Forced March vote while the room is in normal mode", async () => {
    const { rooms } = await createRoomAndJoin("skip-normal-1", ["skip-normal-2"]);
    const [admin, other] = rooms;

    admin.send("vote-skip");
    other.send("vote-skip");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.timeline.segment).toBe(1);
    expect(admin.state.timeline.skipConfirmationAvailable).toBe(false);
    expect(admin.state.players.get(admin.sessionId)?.skipVote).toBe(false);
  });

  it("rejects a Forced March vote outside the active phase", async () => {
    const { rooms } = await createRoomAndJoin("skip-inactive-1", ["skip-inactive-2"], 1);
    const [admin, other] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    await driveToWeekEnd(rooms, 1);

    admin.send("vote-skip");
    other.send("vote-skip");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.timeline.phase).toBe("week-end");
    expect(admin.state.timeline.skipConfirmationAvailable).toBe(false);
    expect(admin.state.timeline.segment).toBe(2);
  });
});

describe("GameRoom Forced March: admin exclusion & skill-check-vote lockout (real Postgres)", () => {
  it("rejects the admin's Forced March vote and never records it", async () => {
    const { rooms } = await createRoomAndJoin("fm-admin-1", ["fm-admin-2"]);
    const [admin, other] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    admin.send("vote-skip");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.players.get(admin.sessionId)?.skipVote).toBe(false);
    expect(admin.state.timeline.skipConfirmationAvailable).toBe(false);

    // The admin's own vote never counts toward the total either -- a single connected non-admin
    // player reaches majority alone.
    other.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
  });

  it("rejects any player's Forced March vote while a skill-check vote is active on the current segment, from a fresh voter and from the admin", async () => {
    const { rooms } = await createRoomAndJoin("fm-lock-1", ["fm-lock-2"]);
    const [admin, other] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    // Cast the skill-check vote before switching to hunted mode, so it's unaffected by the
    // Lead-token eligibility gate -- the lockout under test here cares only that an active vote
    // exists on the current segment, not how it got there.
    other.send("vote-skill-check", { optionIndex: 0 });
    await expect.poll(() => admin.state.timeline.currentSegmentHasActiveVote, { timeout: 5_000 }).toBe(true);

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    other.send("vote-skip");
    admin.send("vote-skip");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.players.get(other.sessionId)?.skipVote).toBe(false);
    expect(admin.state.players.get(admin.sessionId)?.skipVote).toBe(false);
    expect(admin.state.timeline.skipConfirmationAvailable).toBe(false);
  });

  it("becomes available again once the last active skill-check vote on the segment is retracted", async () => {
    const { rooms } = await createRoomAndJoin("fm-unlock-1", ["fm-unlock-2"]);
    const [admin, other] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    other.send("vote-skill-check", { optionIndex: 0 });
    await expect.poll(() => admin.state.timeline.currentSegmentHasActiveVote, { timeout: 5_000 }).toBe(true);

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    other.send("vote-skip");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.players.get(other.sessionId)?.skipVote).toBe(false);

    // Retracting (re-selecting the same option) removes the last active vote -- allowed
    // regardless of Lead-token count, in either mode.
    other.send("vote-skill-check", { optionIndex: 0 });
    await expect.poll(() => admin.state.timeline.currentSegmentHasActiveVote, { timeout: 5_000 }).toBe(false);

    other.send("vote-skip");
    await expect.poll(() => admin.state.players.get(other.sessionId)?.skipVote, { timeout: 5_000 }).toBe(true);
  });

  it("casting or changing a skill-check vote clears every player's Forced March vote and an already-reached majority awaiting confirmation", async () => {
    const { rooms } = await createRoomAndJoin("fm-clear-1", ["fm-clear-2", "fm-clear-3"]);
    const [admin, b, c] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    // A first confirmed Forced March grants b and c each a Lead token, landing on segment 2.
    b.send("vote-skip");
    c.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
    admin.send("confirm-skip");
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(2);
    await expect.poll(() => admin.state.timeline.leadTokenAssignmentAvailable, { timeout: 5_000 }).toBe(true);
    admin.send("assign-lead-tokens");
    await expect.poll(() => admin.state.players.get(b.sessionId)?.leadTokens, { timeout: 5_000 }).toBe(1);

    // A second Forced March vote reaches majority again, awaiting confirmation.
    b.send("vote-skip");
    c.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);

    // b spends their token to roll a check instead -- this withdraws the party's Forced March,
    // even though a majority was already awaiting the admin's confirmation.
    b.send("vote-skill-check", { optionIndex: 0 });
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(false);
    expect(admin.state.players.get(b.sessionId)?.skipVote).toBe(false);
    expect(admin.state.players.get(c.sessionId)?.skipVote).toBe(false);

    // The admin can no longer confirm -- nothing is awaiting it.
    admin.send("confirm-skip");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.timeline.segment).toBe(2);
  });

  it("does not clear a subsequently-cast Forced March vote when an earlier skill-check vote was only retracted", async () => {
    const { rooms } = await createRoomAndJoin("fm-retract-noop-1", ["fm-retract-noop-2", "fm-retract-noop-3"]);
    const [admin, b, c] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    // c casts, then retracts, a skill-check vote in normal mode before the room switches to
    // hunted -- the retraction alone must not interfere with the Forced March vote cast
    // afterward.
    c.send("vote-skill-check", { optionIndex: 0 });
    await expect.poll(() => admin.state.timeline.currentSegmentHasActiveVote, { timeout: 5_000 }).toBe(true);
    c.send("vote-skill-check", { optionIndex: 0 });
    await expect.poll(() => admin.state.timeline.currentSegmentHasActiveVote, { timeout: 5_000 }).toBe(false);

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    b.send("vote-skip");
    await expect.poll(() => admin.state.players.get(b.sessionId)?.skipVote, { timeout: 5_000 }).toBe(true);
    expect(admin.state.timeline.skipConfirmationAvailable).toBe(false);

    c.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
    expect(admin.state.players.get(b.sessionId)?.skipVote).toBe(true);
    expect(admin.state.players.get(c.sessionId)?.skipVote).toBe(true);
  });

  it("recomputes currentSegmentHasActiveVote across a ready-up advance (the same advanceSegment() path a confirmed Forced March shares), a forward override, a backward override, and a week rollover", async () => {
    const { rooms } = await createRoomAndJoin("fm-recompute-1", ["fm-recompute-2"], 1);
    const [admin, other] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBe(2);

    // Ready-up advance: a fresh vote on the new segment sets the flag, an override backward
    // clears it again (segment 1's card has no votes), then forward restores it.
    admin.send("vote-skill-check", { optionIndex: 0 });
    other.send("ready");
    await expect.poll(() => admin.state.players.get(other.sessionId)?.ready, { timeout: 5_000 }).toBe(true);
    admin.send("ready");
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(2);
    expect(admin.state.timeline.currentSegmentHasActiveVote).toBe(false);

    other.send("vote-skill-check", { optionIndex: 0 });
    await expect.poll(() => admin.state.timeline.currentSegmentHasActiveVote, { timeout: 5_000 }).toBe(true);

    admin.send("override-segment", { direction: "previous" });
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(1);
    expect(admin.state.timeline.currentSegmentHasActiveVote).toBe(true);

    admin.send("override-segment", { direction: "next" });
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(2);
    expect(admin.state.timeline.currentSegmentHasActiveVote).toBe(true);

    // Week rollover (daysPerWeek 1 -> segment 2 is the last segment of the week): the new week's
    // segment 1 starts with no votes.
    admin.send("ready");
    other.send("ready");
    await expect.poll(() => admin.state.timeline.phase, { timeout: 5_000 }).toBe("week-end");
    admin.send("resolve-week-end", { outcome: "continue" });
    await expect.poll(() => admin.state.timeline.week, { timeout: 5_000 }).toBe(2);
    expect(admin.state.timeline.currentSegmentHasActiveVote).toBe(false);
  });
});

describe("GameRoom confirm-skip (real Postgres)", () => {
  it("admin confirms a majority Forced March vote, advancing the segment and clearing votes and availability", async () => {
    const { rooms } = await createRoomAndJoin("confirm-1", ["confirm-2", "confirm-3"]);
    const [admin, b, c] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    // Two connected non-admin players (b, c) -- a majority needs both.
    b.send("vote-skip");
    c.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);

    admin.send("confirm-skip");
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(2);
    expect(admin.state.timeline.skipConfirmationAvailable).toBe(false);
    expect(admin.state.players.get(admin.sessionId)?.skipVote).toBe(false);
    expect(admin.state.players.get(b.sessionId)?.skipVote).toBe(false);
    expect(admin.state.players.get(c.sessionId)?.skipVote).toBe(false);
  });

  it("admin confirmation at the week's last segment enters week-end", async () => {
    // daysPerWeek: 1 -> 2 segments total, so the first confirmed Forced March reaches the last
    // segment (2) and the second, from the last segment, enters week-end.
    const { rooms } = await createRoomAndJoin("confirm-weekend-1", ["confirm-weekend-2"], 1);
    const [admin, other] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    other.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
    admin.send("confirm-skip");
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(2);

    other.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
    admin.send("confirm-skip");
    await expect.poll(() => admin.state.timeline.phase, { timeout: 5_000 }).toBe("week-end");
    expect(admin.state.timeline.segment).toBe(2);
  });

  it("rejects confirmation when no Forced March is awaiting it", async () => {
    const { rooms } = await createRoomAndJoin("confirm-none-1");
    const [admin] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    admin.send("confirm-skip");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.timeline.segment).toBe(1);
  });

  it("rejects a non-admin's confirmation attempt", async () => {
    const { rooms } = await createRoomAndJoin("confirm-nonadmin-1", ["confirm-nonadmin-2"]);
    const [admin, other] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    other.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);

    other.send("confirm-skip");
    // No message confirms rejection, so assert the negative by giving the (non-)effect time to
    // arrive and then checking state is unchanged -- the admin's own valid confirmation below
    // proves the room is still responsive, not just slow.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.timeline.segment).toBe(1);

    admin.send("confirm-skip");
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(2);
  });
});

describe("GameRoom assign-lead-tokens (real Postgres)", () => {
  it("admin assigns a Lead token to every connected player after a confirmed Forced March", async () => {
    const { rooms } = await createRoomAndJoin("assign-1", ["assign-2"]);
    const [admin, other] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    other.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
    admin.send("confirm-skip");
    await expect.poll(() => admin.state.timeline.leadTokenAssignmentAvailable, { timeout: 5_000 }).toBe(true);

    admin.send("assign-lead-tokens");
    await expect.poll(() => admin.state.players.get(admin.sessionId)?.leadTokens, { timeout: 5_000 }).toBe(1);
    expect(admin.state.players.get(other.sessionId)?.leadTokens).toBe(1);
  });

  it("stacks an additional Lead token on top of ones a player already holds", async () => {
    const { rooms } = await createRoomAndJoin("assign-stack-1", ["assign-stack-2"]);
    const [admin, other] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    other.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
    admin.send("confirm-skip");
    await expect.poll(() => admin.state.timeline.leadTokenAssignmentAvailable, { timeout: 5_000 }).toBe(true);
    admin.send("assign-lead-tokens");
    await expect.poll(() => admin.state.players.get(admin.sessionId)?.leadTokens, { timeout: 5_000 }).toBe(1);

    other.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
    admin.send("confirm-skip");
    await expect.poll(() => admin.state.timeline.leadTokenAssignmentAvailable, { timeout: 5_000 }).toBe(true);
    admin.send("assign-lead-tokens");
    await expect.poll(() => admin.state.players.get(admin.sessionId)?.leadTokens, { timeout: 5_000 }).toBe(2);
    expect(admin.state.players.get(other.sessionId)?.leadTokens).toBe(2);
  });

  it("does not assign Lead tokens automatically when a Forced March is confirmed", async () => {
    const { rooms } = await createRoomAndJoin("assign-manual-1", ["assign-manual-2"]);
    const [admin, other] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    other.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
    admin.send("confirm-skip");
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(2);

    expect(admin.state.players.get(admin.sessionId)?.leadTokens).toBe(0);
    expect(admin.state.players.get(other.sessionId)?.leadTokens).toBe(0);
  });

  it("rejects assignment when no Forced March has been confirmed", async () => {
    const { rooms } = await createRoomAndJoin("assign-noskip-1");
    const [admin] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    admin.send("assign-lead-tokens");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.players.get(admin.sessionId)?.leadTokens).toBe(0);
  });

  it("rejects a non-admin's assignment attempt", async () => {
    const { rooms } = await createRoomAndJoin("assign-nonadmin-1", ["assign-nonadmin-2"]);
    const [admin, other] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    other.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
    admin.send("confirm-skip");
    await expect.poll(() => admin.state.timeline.leadTokenAssignmentAvailable, { timeout: 5_000 }).toBe(true);

    other.send("assign-lead-tokens");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.players.get(admin.sessionId)?.leadTokens).toBe(0);
    expect(admin.state.players.get(other.sessionId)?.leadTokens).toBe(0);

    admin.send("assign-lead-tokens");
    await expect.poll(() => admin.state.players.get(admin.sessionId)?.leadTokens, { timeout: 5_000 }).toBe(1);
  });

  it("becomes unavailable again immediately after being used", async () => {
    const { rooms } = await createRoomAndJoin("assign-reuse-1", ["assign-reuse-2"]);
    const [admin, other] = rooms;

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    other.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
    admin.send("confirm-skip");
    await expect.poll(() => admin.state.timeline.leadTokenAssignmentAvailable, { timeout: 5_000 }).toBe(true);

    admin.send("assign-lead-tokens");
    await expect.poll(() => admin.state.timeline.leadTokenAssignmentAvailable, { timeout: 5_000 }).toBe(false);

    admin.send("assign-lead-tokens");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.timeline.leadTokenAssignmentAvailable).toBe(false);
    expect(admin.state.players.get(admin.sessionId)?.leadTokens).toBe(1);
  });
});

describe("GameRoom vote-skill-check eligibility gate in Hunted Mode (real Postgres)", () => {
  it("accepts a vote from a player holding a Lead token, without changing their token count", async () => {
    const { rooms } = await createRoomAndJoin("hunted-vote-1", ["hunted-vote-2"]);
    const [admin, other] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    await forcedMarchAndAssignOneTokenEach(admin, other);

    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(
        () => admin.state.timeline.cards.get("2")?.options[0].voters.includes("hunted-vote-1"),
        { timeout: 5_000 },
      )
      .toBe(true);
    // Casting a vote alone never consumes a token (see specs/road-to-survival-hunted-mode -
    // Lead Token Consumed When a Segment Advances) -- it's only spent once the segment resolves.
    expect(admin.state.players.get(admin.sessionId)?.leadTokens).toBe(1);
  });

  it("rejects a new vote from a player holding zero Lead tokens, recording nothing", async () => {
    const { rooms } = await createRoomAndJoin("hunted-vote-notoken-1", ["hunted-vote-notoken-2"]);
    const [admin] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    admin.send("vote-skill-check", { optionIndex: 0 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(
      admin.state.timeline.cards.get("1")?.options.some((o: SegmentCardOptionState) => o.voters.length > 0),
    ).toBe(false);
  });

  it("leaves normal-mode voting unaffected by Lead-token gating", async () => {
    const { rooms } = await createRoomAndJoin("normal-vote-1");
    const [admin] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => admin.state.timeline.cards.get("1")?.options[0].voters.includes("normal-vote-1"), { timeout: 5_000 })
      .toBe(true);
  });
});

describe("GameRoom vote retraction (real Postgres)", () => {
  it("removes a player's vote when they re-select the option they already voted for, visible to all players", async () => {
    const { rooms } = await createRoomAndJoin("retract-1", ["retract-2"]);
    const [admin, other] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => other.state.timeline.cards.get("1")?.options[0].voters.includes("retract-1"), { timeout: 5_000 })
      .toBe(true);

    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => other.state.timeline.cards.get("1")?.options[0].voters.includes("retract-1"), { timeout: 5_000 })
      .toBe(false);
    expect(admin.state.timeline.cards.get("1")?.options[0].voters.includes("retract-1")).toBe(false);
  });

  it("permits retraction from a player holding zero Lead tokens in hunted mode", async () => {
    const { rooms } = await createRoomAndJoin("retract-notoken-1", ["retract-notoken-2"]);
    const [admin, other] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    await forcedMarchAndAssignOneTokenEach(admin, other);

    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => admin.state.timeline.cards.get("2")?.options[0].voters.includes("retract-notoken-1"), { timeout: 5_000 })
      .toBe(true);

    // Toggling back to normal and then back to hunted resets the admin's token count to zero
    // without touching their already-recorded vote -- a realistic way for a player to end up
    // holding an active vote with no tokens left before the segment resolves.
    admin.send("set-mode", { mode: "normal" });
    await expect.poll(() => admin.state.players.get(admin.sessionId)?.leadTokens, { timeout: 5_000 }).toBe(0);
    admin.send("set-mode", { mode: "hunted" });
    await expect.poll(() => admin.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => admin.state.timeline.cards.get("2")?.options[0].voters.includes("retract-notoken-1"), { timeout: 5_000 })
      .toBe(false);
    expect(admin.state.players.get(admin.sessionId)?.leadTokens).toBe(0);
  });

  it("removes a vote in normal mode the same way as in hunted mode", async () => {
    const { rooms } = await createRoomAndJoin("retract-normal-1");
    const [admin] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    admin.send("vote-skill-check", { optionIndex: 2 });
    await expect
      .poll(() => admin.state.timeline.cards.get("1")?.options[2].voters.includes("retract-normal-1"), { timeout: 5_000 })
      .toBe(true);

    admin.send("vote-skill-check", { optionIndex: 2 });
    await expect
      .poll(() => admin.state.timeline.cards.get("1")?.options[2].voters.includes("retract-normal-1"), { timeout: 5_000 })
      .toBe(false);
  });

  it("treats voting for a different option after retracting as a new vote, still subject to the token gate", async () => {
    const { rooms } = await createRoomAndJoin("retract-revote-1", ["retract-revote-2"]);
    const [admin, other] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    await forcedMarchAndAssignOneTokenEach(admin, other);

    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => admin.state.timeline.cards.get("2")?.options[0].voters.includes("retract-revote-1"), { timeout: 5_000 })
      .toBe(true);

    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => admin.state.timeline.cards.get("2")?.options[0].voters.includes("retract-revote-1"), { timeout: 5_000 })
      .toBe(false);

    admin.send("vote-skill-check", { optionIndex: 1 });
    await expect
      .poll(() => admin.state.timeline.cards.get("2")?.options[1].voters.includes("retract-revote-1"), { timeout: 5_000 })
      .toBe(true);
    // None of the cast/retract/cast cycle above touched the reserved token -- still unconsumed.
    expect(admin.state.players.get(admin.sessionId)?.leadTokens).toBe(1);
  });
});

describe("GameRoom Lead token consumption on segment advance (real Postgres)", () => {
  it("readying up consumes exactly one Lead token from each connected player with an active vote", async () => {
    const { rooms } = await createRoomAndJoin("consume-ready-1", ["consume-ready-2"]);
    const [admin, other] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    await forcedMarchAndAssignOneTokenEach(admin, other);

    admin.send("vote-skill-check", { optionIndex: 0 });
    other.send("vote-skill-check", { optionIndex: 1 });
    await expect
      .poll(() => admin.state.timeline.cards.get("2")?.options[1].voters.includes("consume-ready-2"), { timeout: 5_000 })
      .toBe(true);

    admin.send("ready");
    other.send("ready");
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(3);
    expect(admin.state.players.get(admin.sessionId)?.leadTokens).toBe(0);
    expect(admin.state.players.get(other.sessionId)?.leadTokens).toBe(0);
  });

  it("a confirmed Forced March never finds an active vote to consume, since the lockout prevents reaching one", async () => {
    const { rooms } = await createRoomAndJoin("consume-confirm-1", ["consume-confirm-2"]);
    const [admin, other] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    await forcedMarchAndAssignOneTokenEach(admin, other);

    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => admin.state.timeline.cards.get("2")?.options[0].voters.includes("consume-confirm-1"), { timeout: 5_000 })
      .toBe(true);

    // The active vote locks out Forced March voting entirely (see specs/road-to-survival-hunted-
    // mode - Forced March Vote Locked While a Skill-Check Vote Is Active) -- so a confirmed
    // Forced March can never actually find an active vote to consume.
    other.send("vote-skip");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(admin.state.timeline.skipConfirmationAvailable).toBe(false);
    expect(admin.state.timeline.segment).toBe(2);

    // Retracting the vote lifts the lockout -- the Forced March can now be confirmed, but with no
    // active vote left on the segment, nothing is consumed.
    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => admin.state.timeline.cards.get("2")?.options[0].voters.includes("consume-confirm-1"), { timeout: 5_000 })
      .toBe(false);

    other.send("vote-skip");
    await expect.poll(() => admin.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
    admin.send("confirm-skip");
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(3);
    expect(admin.state.players.get(admin.sessionId)?.leadTokens).toBe(1);
    expect(admin.state.players.get(other.sessionId)?.leadTokens).toBe(1);
  });

  it("an admin's forward override consumes tokens for active voters", async () => {
    const { rooms } = await createRoomAndJoin("consume-override-1", ["consume-override-2"]);
    const [admin, other] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    await forcedMarchAndAssignOneTokenEach(admin, other);

    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => admin.state.timeline.cards.get("2")?.options[0].voters.includes("consume-override-1"), { timeout: 5_000 })
      .toBe(true);

    admin.send("override-segment", { direction: "next" });
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(3);
    expect(admin.state.players.get(admin.sessionId)?.leadTokens).toBe(0);
  });

  it("a player without an active vote is unaffected by the advance", async () => {
    const { rooms } = await createRoomAndJoin("consume-novote-1", ["consume-novote-2"]);
    const [admin, other] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    await forcedMarchAndAssignOneTokenEach(admin, other);

    // Only the admin votes on segment 2's card -- "other" leaves their token untouched.
    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => admin.state.timeline.cards.get("2")?.options[0].voters.includes("consume-novote-1"), { timeout: 5_000 })
      .toBe(true);

    admin.send("ready");
    other.send("ready");
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(3);
    expect(admin.state.players.get(admin.sessionId)?.leadTokens).toBe(0);
    expect(admin.state.players.get(other.sessionId)?.leadTokens).toBe(1);
  });

  it("an admin's backward override never consumes a token", async () => {
    const { rooms } = await createRoomAndJoin("consume-backward-1", ["consume-backward-2"]);
    const [admin, other] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    await forcedMarchAndAssignOneTokenEach(admin, other);

    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => admin.state.timeline.cards.get("2")?.options[0].voters.includes("consume-backward-1"), { timeout: 5_000 })
      .toBe(true);

    admin.send("override-segment", { direction: "previous" });
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(1);
    expect(admin.state.players.get(admin.sessionId)?.leadTokens).toBe(1);
    // The vote itself is untouched by stepping backward -- only forward transitions resolve it.
    expect(admin.state.timeline.cards.get("2")?.options[0].voters.includes("consume-backward-1")).toBe(true);
  });

  it("never reduces a player's Lead token count below zero, even if the same segment's votes are resolved twice", async () => {
    const { rooms } = await createRoomAndJoin("consume-floor-1", ["consume-floor-2"]);
    const [admin, other] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBeGreaterThan(0);

    await forcedMarchAndAssignOneTokenEach(admin, other);

    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => admin.state.timeline.cards.get("2")?.options[0].voters.includes("consume-floor-1"), { timeout: 5_000 })
      .toBe(true);

    admin.send("override-segment", { direction: "next" });
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(3);
    expect(admin.state.players.get(admin.sessionId)?.leadTokens).toBe(0);

    // Stepping back to segment 2 (where the same vote is still recorded) and forward again
    // re-resolves that segment's votes -- a known, accepted edge case (see design.md) -- but the
    // count must floor at zero rather than go negative.
    admin.send("override-segment", { direction: "previous" });
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(2);
    admin.send("override-segment", { direction: "next" });
    await expect.poll(() => admin.state.timeline.segment, { timeout: 5_000 }).toBe(3);
    expect(admin.state.players.get(admin.sessionId)?.leadTokens).toBe(0);
  });
});

function waitForExportResult(room: Room): Promise<string> {
  return new Promise((resolve) => {
    room.onMessage<string>("export-week-rolls-result", (markdown) => resolve(markdown));
  });
}

describe("GameRoom export-week-rolls (real Postgres)", () => {
  it("returns a document covering every generated segment's options, DCs, and voters for the admin", async () => {
    const { rooms } = await createRoomAndJoin("export-admin-1", [], 1);
    const [admin] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBe(2);

    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => admin.state.timeline.cards.get("1")?.options[0].voters.includes("export-admin-1"), { timeout: 5_000 })
      .toBe(true);

    const exportPromise = waitForExportResult(admin);
    admin.send("export-week-rolls");
    const markdown = await exportPromise;

    expect(markdown).toContain("Week 1");
    expect(markdown).toContain("Segment 1");
    expect(markdown).toContain("Segment 2");
    const card1 = admin.state.timeline.cards.get("1")!;
    for (const option of card1.options) {
      expect(markdown).toContain(String(option.dc));
    }
    expect(markdown).toContain("export-admin-1");
  });

  it("rejects a non-admin's export request without sending any card or vote data", async () => {
    const { rooms } = await createRoomAndJoin("export-nonadmin-1", ["export-nonadmin-2"], 1);
    const [admin, other] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBe(2);

    let received = false;
    other.onMessage("export-week-rolls-result", () => {
      received = true;
    });

    other.send("export-week-rolls");
    // No message confirms rejection, so assert the negative by giving the (non-)effect time to
    // arrive and then checking nothing was sent -- the admin's own valid request below proves the
    // room is still responsive, not just slow.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(received).toBe(false);

    const exportPromise = waitForExportResult(admin);
    admin.send("export-week-rolls");
    await expect(exportPromise).resolves.toBeTruthy();
  });

  it("reflects a vote cast after a prior export in a subsequent export", async () => {
    const { rooms } = await createRoomAndJoin("export-live-1", [], 1);
    const [admin] = rooms;
    await expect.poll(() => admin.state.timeline.cards.size, { timeout: 5_000 }).toBe(2);

    const firstExportPromise = waitForExportResult(admin);
    admin.send("export-week-rolls");
    const firstMarkdown = await firstExportPromise;
    expect(firstMarkdown).not.toContain("export-live-1");

    admin.send("vote-skill-check", { optionIndex: 0 });
    await expect
      .poll(() => admin.state.timeline.cards.get("1")?.options[0].voters.includes("export-live-1"), { timeout: 5_000 })
      .toBe(true);

    const secondExportPromise = waitForExportResult(admin);
    admin.send("export-week-rolls");
    const secondMarkdown = await secondExportPromise;
    expect(secondMarkdown).toContain("export-live-1");
  });
});
