import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  room: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  roomPlayer: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("./prisma.js", () => ({ prisma: prismaMock }));

const { createRoom, findRoomPlayer, saveRoomPlayerState } = await import("./rooms.js");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createRoom", () => {
  it("retries on code collision up to MAX_CODE_ATTEMPTS then throws", async () => {
    prismaMock.room.findUnique.mockResolvedValue({ id: "existing-room" });

    await expect(createRoom()).rejects.toThrow(
      "Failed to generate a unique room code after multiple attempts",
    );

    expect(prismaMock.room.findUnique).toHaveBeenCalledTimes(10);
    expect(prismaMock.room.create).not.toHaveBeenCalled();
  });

  it("creates a room once a non-colliding code is found", async () => {
    prismaMock.room.findUnique
      .mockResolvedValueOnce({ id: "existing-room" })
      .mockResolvedValueOnce(null);
    prismaMock.room.create.mockResolvedValue({ id: "new-room", code: "ABCDEF" });

    const { room, password } = await createRoom();

    expect(prismaMock.room.findUnique).toHaveBeenCalledTimes(2);
    expect(prismaMock.room.create).toHaveBeenCalledTimes(1);
    expect(room).toEqual({ id: "new-room", code: "ABCDEF" });
    expect(typeof password).toBe("string");
    expect(password.length).toBeGreaterThan(0);
  });
});

describe("findRoomPlayer", () => {
  it("looks up players with case-insensitive username matching", async () => {
    prismaMock.roomPlayer.findFirst.mockResolvedValue({ id: "player-1" });

    await findRoomPlayer("room-1", "SomeUser");

    expect(prismaMock.roomPlayer.findFirst).toHaveBeenCalledWith({
      where: {
        roomId: "room-1",
        username: { equals: "SomeUser", mode: "insensitive" },
      },
    });
  });
});

describe("saveRoomPlayerState", () => {
  it("passes x/y through to the update call", async () => {
    prismaMock.roomPlayer.update.mockResolvedValue({ id: "player-1", x: 3, y: 4 });

    await saveRoomPlayerState("player-1", { x: 3, y: 4 });

    expect(prismaMock.roomPlayer.update).toHaveBeenCalledWith({
      where: { id: "player-1" },
      data: { x: 3, y: 4 },
    });
  });
});
