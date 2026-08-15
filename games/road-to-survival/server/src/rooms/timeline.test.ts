import { describe, expect, it } from "vitest";
import { DEFAULT_DAYS_PER_WEEK, describeSegment, normalizeDaysPerWeek, totalSegments } from "./timeline.js";

describe("normalizeDaysPerWeek", () => {
  it("defaults to 5 when omitted", () => {
    expect(normalizeDaysPerWeek(undefined)).toBe(DEFAULT_DAYS_PER_WEEK);
  });

  it("uses a valid positive integer as-is", () => {
    expect(normalizeDaysPerWeek(3)).toBe(3);
  });

  it.each([0, -1, 2.5, "5", null])("falls back to the default for invalid value %p", (value) => {
    expect(normalizeDaysPerWeek(value)).toBe(DEFAULT_DAYS_PER_WEEK);
  });
});

describe("totalSegments", () => {
  it("is twice the days per week", () => {
    expect(totalSegments(5)).toBe(10);
    expect(totalSegments(3)).toBe(6);
  });
});

describe("describeSegment", () => {
  it("reports segment 3 as Day 2, day-time", () => {
    expect(describeSegment(3)).toEqual({ day: 2, timeOfDay: "day" });
  });

  it("reports segment 6 (of a 3-day week) as Day 3, night-time", () => {
    expect(describeSegment(6)).toEqual({ day: 3, timeOfDay: "night" });
  });

  it("reports segment 1 as Day 1, day-time", () => {
    expect(describeSegment(1)).toEqual({ day: 1, timeOfDay: "day" });
  });
});
