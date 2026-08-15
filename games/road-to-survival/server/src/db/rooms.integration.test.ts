import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { createRoom, createRoomPlayer, findRoomByCode, findRoomPlayer, saveRoomPlayerState } from "./rooms.js";

function uniqueCode(): string {
  return `T${randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase()}`;
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createRoom", () => {
  it("persists a room with a unique, system-generated code and password against real Postgres", async () => {
    const { room, password } = await createRoom();

    expect(typeof password).toBe("string");
    expect(password.length).toBeGreaterThan(0);

    const stored = await findRoomByCode(room.code);
    expect(stored?.id).toBe(room.id);
    expect(stored?.passwordHash).not.toBe(password);
  });
});

describe("room and room-player persistence against real Postgres", () => {
  it("round-trips a room and a room player through the real database", async () => {
    const code = uniqueCode();
    const room = await prisma.room.create({ data: { code, passwordHash: "hashed" } });

    const player = await createRoomPlayer(room.id, "alice", true);

    const found = await findRoomPlayer(room.id, "ALICE");
    expect(found?.id).toBe(player.id);
    expect(found?.isAdmin).toBe(true);

    const updated = await saveRoomPlayerState(player.id, { x: 12, y: 34 });
    expect(updated.x).toBe(12);
    expect(updated.y).toBe(34);
  });

  it("enforces room code uniqueness at the database level", async () => {
    const code = uniqueCode();
    await prisma.room.create({ data: { code, passwordHash: "hashed" } });

    await expect(prisma.room.create({ data: { code, passwordHash: "hashed-2" } })).rejects.toThrow();
  });

  it("enforces (roomId, username) uniqueness at the database level", async () => {
    const room = await prisma.room.create({ data: { code: uniqueCode(), passwordHash: "hashed" } });
    await createRoomPlayer(room.id, "bob", false);

    await expect(createRoomPlayer(room.id, "bob", false)).rejects.toThrow();
  });
});
