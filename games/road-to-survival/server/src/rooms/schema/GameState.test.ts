import { describe, expect, it } from "vitest";
import { GameState, PlayerState } from "./GameState.js";

describe("GameState defaults", () => {
  it("starts a fresh timeline at week 1, segment 1, active, with the default days-per-week", () => {
    const state = new GameState();

    expect(state.timeline.daysPerWeek).toBe(5);
    expect(state.timeline.week).toBe(1);
    expect(state.timeline.segment).toBe(1);
    expect(state.timeline.phase).toBe("active");
  });

  it("defaults a new player to not ready", () => {
    const player = new PlayerState();

    expect(player.ready).toBe(false);
  });
});
