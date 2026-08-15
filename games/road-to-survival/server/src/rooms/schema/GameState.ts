import { MapSchema, Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") sessionId: string = "";
  @type("string") username: string = "";
  @type("boolean") isAdmin: boolean = false;
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("boolean") ready: boolean = false;
}

export type TimelinePhase = "active" | "week-end" | "game-over";

export class TimelineState extends Schema {
  @type("number") daysPerWeek: number = 5;
  @type("number") week: number = 1;
  @type("number") segment: number = 1;
  @type("string") phase: TimelinePhase = "active";
}

export class GameState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type(TimelineState) timeline = new TimelineState();
}
