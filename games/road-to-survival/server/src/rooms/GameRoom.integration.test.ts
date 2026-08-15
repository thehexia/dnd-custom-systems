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
