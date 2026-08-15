import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
const mockJoinById = vi.fn();

vi.mock("colyseus.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("colyseus.js")>();
  return {
    ...actual,
    Client: vi.fn().mockImplementation(function MockClient() {
      return { create: mockCreate, joinById: mockJoinById };
    }),
  };
});

const { ErrorCode } = await import("colyseus.js");
const { createRoom, joinRoom, RoomAccessError } = await import("./room.js");

function serverError(code: number, message: string): Error & { code: number } {
  const err = new Error(message) as Error & { code: number };
  err.code = code;
  return err;
}

beforeEach(() => {
  mockCreate.mockReset();
  mockJoinById.mockReset();
});

describe("createRoom", () => {
  it("resolves with the room, code, and password from the room-created message", async () => {
    const fakeRoom = {
      onMessage: vi.fn((type: string, cb: (data: unknown) => void) => {
        if (type === "room-created") cb({ code: "ABC123", password: "s3cret" });
      }),
    };
    mockCreate.mockResolvedValueOnce(fakeRoom);

    const result = await createRoom("alice");

    expect(mockCreate).toHaveBeenCalledWith("game", { action: "create", username: "alice" });
    expect(result).toEqual({ room: fakeRoom, code: "ABC123", password: "s3cret" });
  });

  it("maps an unrecognized server error to a generic RoomAccessError", async () => {
    mockCreate.mockRejectedValueOnce(
      serverError(ErrorCode.MATCHMAKE_UNHANDLED, "Something else broke."),
    );

    await expect(createRoom("alice")).rejects.toMatchObject({
      reason: "unknown",
    });
  });
});

describe("joinRoom", () => {
  it("resolves with the room on a successful join", async () => {
    const fakeRoom = { id: "room-1" };
    mockJoinById.mockResolvedValueOnce(fakeRoom);

    const room = await joinRoom("ABC123", "alice");

    expect(mockJoinById).toHaveBeenCalledWith("ABC123", { action: "join", code: "ABC123", username: "alice" });
    expect(room).toBe(fakeRoom);
  });

  it("falls back to creating the room when the room id is invalid", async () => {
    mockJoinById.mockRejectedValueOnce(
      serverError(ErrorCode.MATCHMAKE_INVALID_ROOM_ID, "Invalid room."),
    );
    const fakeRoom = { id: "room-new" };
    mockCreate.mockResolvedValueOnce(fakeRoom);

    const room = await joinRoom("UNKNWN", "alice");

    expect(mockCreate).toHaveBeenCalledWith("game", { action: "join", code: "UNKNWN", username: "alice" });
    expect(room).toBe(fakeRoom);
  });

  it("throws a RoomAccessError when both join and the create fallback fail", async () => {
    mockJoinById.mockRejectedValueOnce(
      serverError(ErrorCode.MATCHMAKE_INVALID_ROOM_ID, "Invalid room."),
    );
    mockCreate.mockRejectedValueOnce(serverError(ErrorCode.MATCHMAKE_UNHANDLED, "Nope."));

    await expect(joinRoom("UNKNWN", "alice")).rejects.toBeInstanceOf(RoomAccessError);
  });

  it("surfaces admin-password-required without attempting the create fallback", async () => {
    mockJoinById.mockRejectedValueOnce(
      serverError(
        ErrorCode.AUTH_FAILED,
        "This is the room creator's username. Enter the room password to reconnect as them.",
      ),
    );

    await expect(joinRoom("ABC123", "admin")).rejects.toMatchObject({
      reason: "admin-password-required",
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
