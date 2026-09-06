import { describe, expect, it } from "vitest";
import { GameState, PlayerState } from "./GameState.js";

describe("GameState defaults", () => {
  it("starts a fresh timeline at week 1, segment 1, active, with the default days-per-week", () => {
    const state = new GameState();

    expect(state.timeline.daysPerWeek).toBe(5);
    expect(state.timeline.week).toBe(1);
    expect(state.timeline.segment).toBe(1);
    expect(state.timeline.phase).toBe("active");
    expect(state.timeline.mode).toBe("normal");
    expect(state.timeline.skipConfirmationAvailable).toBe(false);
    expect(state.timeline.leadTokenAssignmentAvailable).toBe(false);
    expect(state.timeline.currentSegmentHasActiveVote).toBe(false);
  });

  it("defaults a new player to not ready, not skip-voted, and holding no Lead tokens", () => {
    const player = new PlayerState();

    expect(player.ready).toBe(false);
    expect(player.skipVote).toBe(false);
    expect(player.leadTokens).toBe(0);
  });
});
