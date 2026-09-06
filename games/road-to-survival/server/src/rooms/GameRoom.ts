import { Client, ErrorCode, Room, ServerError } from "@colyseus/core";
import type { AuthContext } from "@colyseus/core";
import {
  createRoom as createRoomRecord,
  createRoomPlayer,
  findRoomByCode,
  findRoomPlayer,
  saveRoomPlayerState,
} from "../db/rooms.js";
import { deleteVote, loadOrCreateWeekCards, upsertVote } from "../db/segmentCards.js";
import { GameState, PlayerState, SegmentCardOptionState, SegmentCardState } from "./schema/GameState.js";
import { verifyRoomPassword } from "./roomCredentials.js";
import { normalizeDaysPerWeek, totalSegments } from "./timeline.js";
import { formatWeekExport } from "./weekExport.js";

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

interface SetModeMessage {
  mode: "normal" | "hunted";
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
    this.recomputeCurrentSegmentHasActiveVote();

    this.onMessage("ready", (client) => {
      if (this.state.timeline.phase !== "active") return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.ready = true;
      this.maybeAdvance();
    });

    this.onMessage<SetModeMessage>("set-mode", (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.isAdmin) return;
      if (message.mode !== "normal" && message.mode !== "hunted") return;

      this.state.timeline.mode = message.mode;
      if (message.mode === "normal") {
        for (const p of this.state.players.values()) p.leadTokens = 0;
        this.state.timeline.skipConfirmationAvailable = false;
        this.state.timeline.leadTokenAssignmentAvailable = false;
      }
    });

    this.onMessage("vote-skip", (client) => {
      if (this.state.timeline.mode !== "hunted") return;
      if (this.state.timeline.phase !== "active") return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (player.isAdmin) return;
      if (this.state.timeline.currentSegmentHasActiveVote) return;
      player.skipVote = true;
      this.maybeSkip();
    });

    this.onMessage("confirm-skip", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.isAdmin) return;
      if (!this.state.timeline.skipConfirmationAvailable) return;

      this.advanceSegment();
      this.state.timeline.leadTokenAssignmentAvailable = true;
    });

    this.onMessage("assign-lead-tokens", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.isAdmin) return;
      if (!this.state.timeline.leadTokenAssignmentAvailable) return;

      for (const p of this.state.players.values()) p.leadTokens += 1;
      this.state.timeline.leadTokenAssignmentAvailable = false;
    });

    this.onMessage<ResolveWeekEndMessage>("resolve-week-end", async (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.isAdmin) return;
      if (this.state.timeline.phase !== "week-end") return;

      if (message.outcome === "continue") {
        this.state.timeline.week += 1;
        this.state.timeline.segment = 1;
        this.state.timeline.phase = "active";
        this.state.timeline.leadTokenAssignmentAvailable = false;
        for (const p of this.state.players.values()) {
          p.ready = false;
          p.skipVote = false;
        }
        await this.ensureWeekCards(this.state.timeline.week);
        this.recomputeCurrentSegmentHasActiveVote();
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

      const currentOptionIndex = cardState.options.findIndex((option) => option.voters.includes(player.username));

      if (currentOptionIndex === optionIndex) {
        // Re-selecting the option already voted for retracts it (see
        // specs/road-to-survival-skill-check-cards - Vote Retraction). No Lead-token gate
        // applies -- retracting never costs anything, in either mode. Retraction alone does not
        // clear any in-progress Forced March vote (see Forced March Vote Locked While a
        // Skill-Check Vote Is Active) -- only casting or changing a vote does, below.
        await deleteVote(cardId, roomPlayerId);
        const voters = cardState.options[optionIndex].voters;
        voters.splice(voters.indexOf(player.username), 1);
        this.recomputeCurrentSegmentHasActiveVote();
        return;
      }

      if (this.state.timeline.mode === "hunted" && player.leadTokens <= 0) return;

      await upsertVote(cardId, roomPlayerId, optionIndex);

      for (const option of cardState.options) {
        const existingIndex = option.voters.indexOf(player.username);
        if (existingIndex !== -1) option.voters.splice(existingIndex, 1);
      }
      cardState.options[optionIndex].voters.push(player.username);

      // In Hunted Mode, a Lead token is reserved (not yet spent) by this vote -- it's only
      // deducted when the segment resolves (see specs/road-to-survival-hunted-mode - Lead Token
      // Consumed When a Segment Advances), so a player can freely retract or change their vote
      // before then without losing anything.

      // Committing to roll a check withdraws the party's Forced March intent, even a
      // majority already awaiting confirmation (see specs/road-to-survival-hunted-mode -
      // Forced March Vote Locked While a Skill-Check Vote Is Active).
      if (this.state.timeline.mode === "hunted") {
        this.clearForcedMarchVotes();
      }
      this.recomputeCurrentSegmentHasActiveVote();
    });

    this.onMessage("export-week-rolls", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player?.isAdmin) return;

      const segments = [...this.state.timeline.cards.entries()].map(([segment, card]) => ({
        segment: Number(segment),
        options: card.options.map((option) => ({
          skill: option.skill,
          dc: option.dc,
          voters: [...option.voters],
        })),
      }));

      const markdown = formatWeekExport(this.state.timeline.week, segments);
      client.send("export-week-rolls-result", markdown);
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
        timeline.leadTokenAssignmentAvailable = false;
        for (const p of this.state.players.values()) {
          p.ready = false;
          p.skipVote = false;
        }
        this.recomputeCurrentSegmentHasActiveVote();
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
   * Recomputes whether a majority of currently connected players have voted for a Forced March
   * through the current segment, while the room is in Hunted Mode (see
   * specs/road-to-survival-hunted-mode's Majority Forced March Vote Awaits Admin Confirmation
   * requirement). Does NOT advance the timeline itself -- it only marks the vote as available for
   * the admin to confirm (see confirm-skip), and clears that availability again if the majority
   * is lost (e.g. a voting player disconnects) before the admin acts.
   */
  private maybeSkip(): void {
    const { timeline } = this.state;
    if (timeline.mode !== "hunted" || timeline.phase !== "active") {
      timeline.skipConfirmationAvailable = false;
      return;
    }

    // The admin never casts a Forced March vote (see specs/road-to-survival-hunted-mode -
    // Forced March Vote), so the majority is evaluated only against non-admin players.
    const voters = [...this.state.players.values()].filter((p) => !p.isAdmin);
    const skipCount = voters.filter((p) => p.skipVote).length;
    timeline.skipConfirmationAvailable = voters.length > 0 && skipCount > voters.length / 2;
  }

  /**
   * Resets every connected player's Forced March vote and clears any awaiting-confirmation
   * state, even if a majority had already been reached. Called when a player casts or changes
   * (not retracts) a skill-check vote in Hunted Mode -- committing to roll a check withdraws the
   * party's Forced March intent (see specs/road-to-survival-hunted-mode - Forced March Vote
   * Locked While a Skill-Check Vote Is Active).
   */
  private clearForcedMarchVotes(): void {
    for (const p of this.state.players.values()) p.skipVote = false;
    this.state.timeline.skipConfirmationAvailable = false;
  }

  /**
   * Recomputes whether the room's actual current segment's card has at least one active
   * skill-check vote, and syncs it to `timeline.currentSegmentHasActiveVote` (see
   * specs/road-to-survival-hunted-mode - Forced March Vote Locked While a Skill-Check Vote Is
   * Active). Called whenever a vote is cast, changed, or retracted on the current segment, and
   * whenever the current segment itself changes.
   */
  private recomputeCurrentSegmentHasActiveVote(): void {
    const { timeline } = this.state;
    const cardState = timeline.cards.get(String(timeline.segment));
    timeline.currentSegmentHasActiveVote = cardState
      ? cardState.options.some((option) => option.voters.length > 0)
      : false;
  }

  /**
   * Increments the segment, or -- on the week's last segment -- enters the week-end decision
   * state instead of advancing further, then resets every connected player's readiness and
   * skip vote (see specs/road-to-survival-timeline-board's Segment Advances / Week-End Decision
   * Point requirements, and specs/road-to-survival-hunted-mode's Admin Confirms the Forced March
   * requirement). Also clears the Forced March confirmation availability and any pending
   * Lead-token assignment, since both were earned by the specific segment being left --
   * confirm-skip re-enables the Lead-token assignment immediately after, when this transition was
   * itself triggered by a confirmed Forced March. This is the single transition shared by
   * ready-up, a confirmed Forced March, and the forward admin override, so consuming Lead tokens
   * for the segment being left happens here too -- covering all three chargeable paths at once
   * (see specs/road-to-survival-hunted-mode's Lead Token Consumed When a Segment Advances
   * requirement). The backward override never calls this method, so it never charges a token.
   */
  private advanceSegment(): void {
    const { timeline } = this.state;
    this.consumeLeadTokensForSegment(timeline.segment);

    const total = totalSegments(timeline.daysPerWeek);
    if (timeline.segment < total) {
      timeline.segment += 1;
    } else {
      timeline.phase = "week-end";
    }
    timeline.skipConfirmationAvailable = false;
    timeline.leadTokenAssignmentAvailable = false;
    for (const p of this.state.players.values()) {
      p.ready = false;
      p.skipVote = false;
    }
    this.recomputeCurrentSegmentHasActiveVote();
  }

  /**
   * Consumes one Lead token from every currently connected player who holds an active
   * skill-check vote on the given segment's card, while the room is in Hunted Mode. A player who
   * voted and then disconnected before the segment resolves is not charged -- they're no longer
   * in `this.state.players` (keyed by sessionId) to look up, consistent with how other ephemeral
   * per-player Hunted-Mode state doesn't survive a disconnect/reconnect either.
   */
  private consumeLeadTokensForSegment(segment: number): void {
    if (this.state.timeline.mode !== "hunted") return;

    const cardState = this.state.timeline.cards.get(String(segment));
    if (!cardState) return;

    const votedUsernames = new Set<string>();
    for (const option of cardState.options) {
      for (const username of option.voters) votedUsernames.add(username);
    }
    for (const player of this.state.players.values()) {
      if (votedUsernames.has(player.username)) {
        player.leadTokens = Math.max(0, player.leadTokens - 1);
      }
    }
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
    this.maybeSkip();
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
