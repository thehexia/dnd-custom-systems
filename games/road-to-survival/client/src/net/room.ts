import { Client, ErrorCode, type Room } from "colyseus.js";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "ws://localhost:2567";

const client = new Client(SERVER_URL);

export type RoomAccessErrorReason =
  | "invalid-credentials"
  | "username-taken"
  | "admin-password-required"
  | "unknown";

const ADMIN_PASSWORD_REQUIRED_ERROR = "This is the room creator's username. Enter the room password to reconnect as them.";

export class RoomAccessError extends Error {
  reason: RoomAccessErrorReason;

  constructor(reason: RoomAccessErrorReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface CreateRoomResult {
  room: Room;
  code: string;
  password: string;
}

// Matchmaking-phase failures (e.g. room not found) reject as colyseus.js's `MatchMakeError`,
// while auth/join failures inside an already-selected room reject as its `ServerError` -- both
// expose the same { code, message } shape, so we match on that instead of a specific class.
function errorCode(err: unknown): number | undefined {
  return typeof err === "object" && err !== null && "code" in err && typeof (err as { code: unknown }).code === "number"
    ? (err as { code: number }).code
    : undefined;
}

function toRoomAccessError(err: unknown): RoomAccessError {
  const code = errorCode(err);
  const message = err instanceof Error ? err.message : String(err);

  if (code === ErrorCode.AUTH_FAILED && message === ADMIN_PASSWORD_REQUIRED_ERROR) {
    return new RoomAccessError("admin-password-required", message);
  }
  if (code === ErrorCode.AUTH_FAILED || code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID) {
    return new RoomAccessError("invalid-credentials", "Invalid room code or password.");
  }
  if (code === ErrorCode.MATCHMAKE_UNHANDLED && /username/i.test(message)) {
    return new RoomAccessError("username-taken", message);
  }
  return new RoomAccessError("unknown", message);
}

export function createRoom(username: string): Promise<CreateRoomResult> {
  return new Promise((resolve, reject) => {
    client
      .create("game", { action: "create", username })
      .then((room) => {
        room.onMessage<{ code: string; password: string }>("room-created", (data) => {
          resolve({ room, code: data.code, password: data.password });
        });
      })
      .catch((err) => reject(toRoomAccessError(err)));
  });
}

export async function joinRoom(code: string, username: string, password?: string): Promise<Room> {
  const options = password
    ? { action: "join" as const, code, username, password }
    : { action: "join" as const, code, username };

  try {
    return await client.joinById(code, options);
  } catch (err) {
    if (errorCode(err) === ErrorCode.MATCHMAKE_INVALID_ROOM_ID) {
      try {
        return await client.create("game", options);
      } catch (createErr) {
        throw toRoomAccessError(createErr);
      }
    }
    throw toRoomAccessError(err);
  }
}
