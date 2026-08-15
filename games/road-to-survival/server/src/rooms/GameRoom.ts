import { Client, ErrorCode, Room, ServerError } from "@colyseus/core";
import type { AuthContext } from "@colyseus/core";
import {
  createRoom as createRoomRecord,
  createRoomPlayer,
  findRoomByCode,
  findRoomPlayer,
  saveRoomPlayerState,
} from "../db/rooms.js";
import { GameState, PlayerState } from "./schema/GameState.js";
import { verifyRoomPassword } from "./roomCredentials.js";

const GENERIC_ACCESS_ERROR = "Invalid room code or password.";
const ADMIN_PASSWORD_REQUIRED_ERROR = "This is the room creator's username. Enter the room password to reconnect as them.";
const FLUSH_INTERVAL_MS = 5000;

interface MoveMessage {
  x: number;
  y: number;
}

interface CreateOptions {
  action: "create";
  username: string;
}

interface JoinOptions {
  action: "join";
  code: string;
  username: string;
  password?: string;
}

type GameRoomOptions = CreateOptions | JoinOptions;

export class GameRoom extends Room<GameState> {
  maxClients = 8;

  private roomDbId = "";
  private passwordHash = "";
  private pendingPassword?: string;
  private creatorRoomPlayerId = "";
  private creatorUsername = "";
  private roomPlayerIdBySession = new Map<string, string>();

  async onCreate(options: GameRoomOptions) {
    this.setState(new GameState());

    if (options.action === "create") {
      if (!options.username) {
        throw new ServerError(ErrorCode.MATCHMAKE_UNHANDLED, "Username is required.");
      }
      const { room, password } = await createRoomRecord();
      this.roomDbId = room.id;
      this.roomId = room.code;
      this.passwordHash = room.passwordHash;
      this.pendingPassword = password;
      this.creatorUsername = options.username;

      const adminPlayer = await createRoomPlayer(room.id, options.username, true);
      this.creatorRoomPlayerId = adminPlayer.id;
    } else {
      const room = await findRoomByCode(options.code);
      if (!room) {
        throw new ServerError(ErrorCode.MATCHMAKE_INVALID_ROOM_ID, GENERIC_ACCESS_ERROR);
      }
      this.roomDbId = room.id;
      this.roomId = room.code;
      this.passwordHash = room.passwordHash;
    }

    this.onMessage<MoveMessage>("move", (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.x = message.x;
      player.y = message.y;
    });

    this.clock.setInterval(() => this.flushState(), FLUSH_INTERVAL_MS);
  }

  async onAuth(_client: Client, options: GameRoomOptions, _context: AuthContext) {
    if (options.action === "create") {
      return true;
    }

    if (options.username) {
      const existingPlayer = await findRoomPlayer(this.roomDbId, options.username);
      if (existingPlayer?.isAdmin) {
        if (!options.password || !(await verifyRoomPassword(options.password, this.passwordHash))) {
          throw new ServerError(ErrorCode.AUTH_FAILED, ADMIN_PASSWORD_REQUIRED_ERROR);
        }
      }
    }

    return true;
  }

  async onJoin(client: Client, options: GameRoomOptions) {
    if (options.action === "create") {
      const player = new PlayerState();
      player.sessionId = client.sessionId;
      player.username = this.creatorUsername;
      player.isAdmin = true;
      this.state.players.set(client.sessionId, player);
      this.roomPlayerIdBySession.set(client.sessionId, this.creatorRoomPlayerId);

      client.send("room-created", { code: this.roomId, password: this.pendingPassword });
      this.pendingPassword = undefined;
      return;
    }

    const username = options.username;
    if (!username) {
      throw new ServerError(ErrorCode.MATCHMAKE_UNHANDLED, "Username is required.");
    }

    const activeUsernameTaken = [...this.state.players.values()].some(
      (p) => p.username.toLowerCase() === username.toLowerCase(),
    );
    if (activeUsernameTaken) {
      throw new ServerError(ErrorCode.MATCHMAKE_UNHANDLED, "That username is already connected in this room.");
    }

    let roomPlayer = await findRoomPlayer(this.roomDbId, username);

    const player = new PlayerState();
    player.sessionId = client.sessionId;
    player.username = username;

    if (roomPlayer) {
      player.isAdmin = roomPlayer.isAdmin;
      player.x = roomPlayer.x;
      player.y = roomPlayer.y;
    } else {
      roomPlayer = await createRoomPlayer(this.roomDbId, username, false);
    }

    this.roomPlayerIdBySession.set(client.sessionId, roomPlayer.id);
    this.state.players.set(client.sessionId, player);
  }

  async onLeave(client: Client) {
    await this.persistSession(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.roomPlayerIdBySession.delete(client.sessionId);
    console.log(`${client.sessionId} left ${this.roomId}`);
  }

  async onDispose() {
    await this.flushState();
    console.log(`room ${this.roomId} disposed`);
  }

  private async flushState() {
    await Promise.all(
      [...this.roomPlayerIdBySession.keys()].map((sessionId) => this.persistSession(sessionId)),
    );
  }

  private async persistSession(sessionId: string) {
    const roomPlayerId = this.roomPlayerIdBySession.get(sessionId);
    const player = this.state.players.get(sessionId);
    if (!roomPlayerId || !player) return;
    await saveRoomPlayerState(roomPlayerId, { x: player.x, y: player.y }).catch((err) => {
      console.error(`Failed to persist state for session ${sessionId}:`, err);
    });
  }
}
