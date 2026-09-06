import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") sessionId: string = "";
  @type("string") username: string = "";
  @type("boolean") isAdmin: boolean = false;
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("boolean") ready: boolean = false;
  // Hunted Mode only (see specs/road-to-survival-hunted-mode): whether this player has voted for
  // a Forced March through the current segment, and how many spendable Lead tokens they hold --
  // a player may accumulate more than one, so this is a count, not a flag.
  @type("boolean") skipVote: boolean = false;
  @type("number") leadTokens: number = 0;
}

export type TimelinePhase = "active" | "week-end" | "game-over";
export type RoomMode = "normal" | "hunted";

// A single skill-check option on a segment's content card (see
// specs/road-to-survival-skill-check-cards). `voters` holds the usernames of every player
// currently voting for this option, not sessionIds, so a vote survives a reconnect.
export class SegmentCardOptionState extends Schema {
  @type("string") skill: string = "";
  @type("number") dc: number = 0;
  @type(["string"]) voters = new ArraySchema<string>();
}

export class SegmentCardState extends Schema {
  @type([SegmentCardOptionState]) options = new ArraySchema<SegmentCardOptionState>();
}

export class TimelineState extends Schema {
  @type("number") daysPerWeek: number = 5;
  @type("number") week: number = 1;
  @type("number") segment: number = 1;
  @type("string") phase: TimelinePhase = "active";
  // Keyed by segment number (as a string, per MapSchema key type), scoped to the current week
  // only -- matches the nav bar's existing current-week-only scope (see design.md's "Room-state
  // schema mirrors only the current week's cards/votes" decision).
  @type({ map: SegmentCardState }) cards = new MapSchema<SegmentCardState>();
  // Admin-controlled room mode (see specs/road-to-survival-hunted-mode). Whether a majority
  // Forced March vote is currently awaiting the admin's confirmation, and whether a Hunted-Mode
  // Lead-token assignment is currently available to the admin, are tracked separately below --
  // the latter is earned by a *confirmed* Forced March, not by mode/phase alone.
  @type("string") mode: RoomMode = "normal";
  @type("boolean") skipConfirmationAvailable: boolean = false;
  @type("boolean") leadTokenAssignmentAvailable: boolean = false;
  // Whether the room's actual current segment's card has at least one active skill-check vote
  // (see specs/road-to-survival-hunted-mode - Forced March Vote Locked While a Skill-Check Vote
  // Is Active). Kept in sync by GameRoom rather than derived client-side.
  @type("boolean") currentSegmentHasActiveVote: boolean = false;
}

export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type(TimelineState) timeline = new TimelineState();
}
