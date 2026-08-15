import { Server } from "@colyseus/core";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { Room } from "colyseus.js";
import { createServer } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../db/prisma.js";
import { findRoomByCode, findRoomPlayer } from "../db/rooms.js";
import { GameRoom } from "./GameRoom.js";

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
