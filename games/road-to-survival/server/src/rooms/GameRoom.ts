import { Client, ErrorCode, Room, ServerError } from "@colyseus/core";
import type { AuthContext } from "@colyseus/core";
import {
  createRoom as createRoomRecord,
  createRoomPlayer,
  findRoomByCode,
  findRoomPlayer,
  saveRoomPlayerState,
} from "../db/rooms.js";
import { loadOrCreateWeekCards, upsertVote } from "../db/segmentCards.js";
import { GameState, PlayerState, SegmentCardOptionState, SegmentCardState } from "./schema/GameState.js";
import { verifyRoomPassword } from "./roomCredentials.js";
import { normalizeDaysPerWeek, totalSegments } from "./timeline.js";

const GENERIC_ACCESS_ERROR = "Invalid room code or password.";
const ADMIN_PASSWORD_REQUIRED_ERROR = "This is the room creator's username. Enter the room password to reconnect as them.";
const FLUSH_INTERVAL_MS = 5000;

interface ResolveWeekEndMessage {
  outcome: "continue" | "death";
}

interface OverrideSegmentMessage {
  direction: "next" | "previous";
}

interface VoteSkillCheckMessage {
  optionIndex: number;
}

interface CreateOptions {
  action: "create";
  username: string;
  daysPerWeek?: number;
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
  private cardIdBySegment = new Map<number, string>();

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
      // Days-per-week is only configurable at creation and is not persisted to Postgres -- if
      // this room's live process fully disposes and a later rejoin has to recreate it (see
      // onAuth/onJoin's "join" branch below), the timeline resets to defaults. Accepted for now
      // per design.md's Non-Goals (no cross-session timeline persistence).
      this.state.timeline.daysPerWeek = normalizeDaysPerWeek(options.daysPerWeek);

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

    // The timeline always starts a live process at Week 1 (see the daysPerWeek comment above --
    // it isn't persisted, so a process recreated via the "join" branch resets here too), so
    // Week 1's cards are what this process needs regardless of which branch created it. If this
    // room already generated Week 1's cards in an earlier process, this loads them unchanged
    // instead of regenerating (see specs/road-to-survival-skill-check-cards - Card Generation
    // Timing's "survives room recreation" scenario).
    await this.ensureWeekCards(this.state.timeline.week);

    this.onMessage("ready", (client) => {
      if (this.state.timeline.phase !== "active") return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.ready = true;
      this.maybeAdvance();
    });

    this.onMessage<ResolveWeekEndMessage>("resolve-week-end", async (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.isAdmin) return;
      if (this.state.timeline.phase !== "week-end") return;

      if (message.outcome === "continue") {
        this.state.timeline.week += 1;
        this.state.timeline.segment = 1;
        this.state.timeline.phase = "active";
        for (const p of this.state.players.values()) p.ready = false;
        await this.ensureWeekCards(this.state.timeline.week);
      } else if (message.outcome === "death") {
        this.state.timeline.phase = "game-over";
      }
    });

    this.onMessage<VoteSkillCheckMessage>("vote-skill-check", async (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (this.state.timeline.phase !== "active") return;

      const { optionIndex } = message;
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) return;

      const segment = this.state.timeline.segment;
      const cardState = this.state.timeline.cards.get(String(segment));
      const cardId = this.cardIdBySegment.get(segment);
      const roomPlayerId = this.roomPlayerIdBySession.get(client.sessionId);
      if (!cardState || !cardId || !roomPlayerId) return;

      await upsertVote(cardId, roomPlayerId, optionIndex);

      for (const option of cardState.options) {
        const existingIndex = option.voters.indexOf(player.username);
        if (existingIndex !== -1) option.voters.splice(existingIndex, 1);
      }
      cardState.options[optionIndex].voters.push(player.username);
    });

    this.onMessage<OverrideSegmentMessage>("override-segment", (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.isAdmin) return;
      if (this.state.timeline.phase !== "active") return;

      if (message.direction === "next") {
        this.advanceSegment();
      } else if (message.direction === "previous") {
        const { timeline } = this.state;
        if (timeline.segment > 1) {
          timeline.segment -= 1;
        }
        for (const p of this.state.players.values()) p.ready = false;
      }
    });

    this.clock.setInterval(() => this.flushState(), FLUSH_INTERVAL_MS);
  }

  /**
   * Advances the shared timeline once every currently connected player is ready (see
   * specs/road-to-survival-timeline-board's Segment Advances requirement), or immediately for an
   * admin's forward override (see the Admin Override requirement).
   */
  private maybeAdvance(): void {
    const { timeline } = this.state;
    if (timeline.phase !== "active") return;

    const players = [...this.state.players.values()];
    if (players.length === 0 || !players.every((p) => p.ready)) return;

    this.advanceSegment();
  }

  /**
   * Increments the segment, or -- on the week's last segment -- enters the week-end decision
   * state instead of advancing further, then resets every connected player's readiness (see
   * specs/road-to-survival-timeline-board's Segment Advances / Week-End Decision Point
   * requirements).
   */
  private advanceSegment(): void {
    const { timeline } = this.state;
    const total = totalSegments(timeline.daysPerWeek);
    if (timeline.segment < total) {
      timeline.segment += 1;
    } else {
      timeline.phase = "week-end";
    }
    for (const p of this.state.players.values()) p.ready = false;
  }

  /**
   * Loads (self-healing any gap) or generates every segment's skill-check card for the given
   * week, then replaces `state.timeline.cards` with them (see design.md's "Card generation is
   * server-authoritative and idempotent" and "Room-process recreation loads rather than
   * regenerates" decisions).
   */
  private async ensureWeekCards(week: number): Promise<void> {
    const total = totalSegments(this.state.timeline.daysPerWeek);
    const cards = await loadOrCreateWeekCards(this.roomDbId, week, total);

    this.state.timeline.cards.clear();
    this.cardIdBySegment.clear();

    for (const card of cards) {
      const cardState = new SegmentCardState();
      const options = card.options as { skill: string; dc: number }[];
      for (const option of options) {
        const optionState = new SegmentCardOptionState();
        optionState.skill = option.skill;
        optionState.dc = option.dc;
        cardState.options.push(optionState);
      }
      for (const vote of card.votes) {
        cardState.options[vote.optionIndex]?.voters.push(vote.roomPlayer.username);
      }
      this.state.timeline.cards.set(String(card.segment), cardState);
      this.cardIdBySegment.set(card.segment, card.id);
    }
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
    this.maybeAdvance();
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
