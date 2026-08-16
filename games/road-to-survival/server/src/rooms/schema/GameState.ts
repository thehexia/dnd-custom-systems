import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") sessionId: string = "";
  @type("string") username: string = "";
  @type("boolean") isAdmin: boolean = false;
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("boolean") ready: boolean = false;
}

export type TimelinePhase = "active" | "week-end" | "game-over";

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
}

export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type(TimelineState) timeline = new TimelineState();
}
