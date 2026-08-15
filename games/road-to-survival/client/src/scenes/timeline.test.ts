import { describe, expect, it } from "vitest";
import { computeVerticalTileLayout, describeSegment, iconKeyForTimeOfDay, nextSelectedSegment, tileVisualState } from "./timeline";

describe("describeSegment", () => {
  it("reports segment 3 of a default 5-day week as Day 2, day-time", () => {
    expect(describeSegment(3)).toEqual({ day: 2, timeOfDay: "day" });
  });

  it("reports segment 10 of a default 5-day week as Day 5, night-time", () => {
    expect(describeSegment(10)).toEqual({ day: 5, timeOfDay: "night" });
  });

  it("reports segment 6 of a custom 3-day week as Day 3, night-time", () => {
    expect(describeSegment(6)).toEqual({ day: 3, timeOfDay: "night" });
  });

  it("reports segment 1 as Day 1, day-time", () => {
    expect(describeSegment(1)).toEqual({ day: 1, timeOfDay: "day" });
  });
});

describe("nextSelectedSegment", () => {
  it("follows the current segment when nothing has been selected yet", () => {
    expect(nextSelectedSegment(null, null, 1)).toBe(1);
  });

  it("follows the current segment advancing when the player was already viewing the current segment", () => {
    expect(nextSelectedSegment(3, 3, 4)).toBe(4);
  });

  it("keeps the player's manual selection when the current segment advances past it", () => {
    expect(nextSelectedSegment(2, 3, 4)).toBe(2);
  });
});

describe("tileVisualState", () => {
  it("marks segments before the current segment as completed", () => {
    expect(tileVisualState(1, 3, 3)).toMatchObject({ isCompleted: true, isCurrent: false });
  });

  it("marks the current segment as current", () => {
    expect(tileVisualState(3, 3, 3)).toMatchObject({ isCompleted: false, isCurrent: true });
  });

  it("marks segments after the current segment as neither completed nor current", () => {
    expect(tileVisualState(5, 3, 3)).toMatchObject({ isCompleted: false, isCurrent: false });
  });

  it("marks the selected segment independently of completed/current", () => {
    expect(tileVisualState(5, 3, 5)).toMatchObject({ isSelected: true, isCurrent: false });
    expect(tileVisualState(3, 3, 5)).toMatchObject({ isSelected: false, isCurrent: true });
  });

  it("reports the segment's actual day/night time-of-day", () => {
    expect(tileVisualState(2, 3, 3).timeOfDay).toBe("night");
    expect(tileVisualState(3, 3, 3).timeOfDay).toBe("day");
  });
});

describe("iconKeyForTimeOfDay", () => {
  it("maps day to the sun icon", () => {
    expect(iconKeyForTimeOfDay("day")).toBe("sun");
  });

  it("maps night to the moon icon", () => {
    expect(iconKeyForTimeOfDay("night")).toBe("moon");
  });
});

describe("computeVerticalTileLayout", () => {
  it("stacks tiles top to bottom with a gap between each", () => {
    const { tileHeight, positions } = computeVerticalTileLayout(4, 400, 10);
    expect(tileHeight).toBe(90);
    expect(positions).toEqual([0, 100, 200, 300]);
  });

  it("floors tile height at the configured minimum for large segment counts", () => {
    const { tileHeight } = computeVerticalTileLayout(100, 400, 6, 20);
    expect(tileHeight).toBe(20);
  });
});
