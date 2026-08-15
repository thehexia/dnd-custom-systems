import { describe, expect, it } from "vitest";
import { describeSegment } from "./timeline";

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
