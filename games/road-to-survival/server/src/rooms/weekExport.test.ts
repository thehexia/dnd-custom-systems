import { describe, expect, it } from "vitest";
import { formatWeekExport } from "./weekExport.js";

describe("formatWeekExport", () => {
  it("lists multiple segments in ascending segment order regardless of input order", () => {
    const markdown = formatWeekExport(2, [
      { segment: 3, options: [{ skill: "stealth", dc: 12, voters: [] }] },
      { segment: 1, options: [{ skill: "athletics", dc: 14, voters: [] }] },
    ]);

    const segment1Index = markdown.indexOf("Segment 1");
    const segment3Index = markdown.indexOf("Segment 3");
    expect(segment1Index).toBeGreaterThanOrEqual(0);
    expect(segment3Index).toBeGreaterThan(segment1Index);
  });

  it("lists every voter for an option with multiple votes", () => {
    const markdown = formatWeekExport(1, [
      { segment: 1, options: [{ skill: "arcana", dc: 17, voters: ["alice", "bob"] }] },
    ]);

    expect(markdown).toContain("Arcana");
    expect(markdown).toContain("alice, bob");
  });

  it("shows an explicit no-votes indication for an option with no voters", () => {
    const markdown = formatWeekExport(1, [
      { segment: 1, options: [{ skill: "insight", dc: 19, voters: [] }] },
    ]);

    expect(markdown).toContain("No votes");
  });

  it("omits a segment that has no card data", () => {
    const markdown = formatWeekExport(1, [
      { segment: 1, options: [{ skill: "history", dc: 10, voters: [] }] },
    ]);

    expect(markdown).toContain("Segment 1");
    expect(markdown).not.toContain("Segment 2");
  });

  it("includes each segment's day and time-of-day label", () => {
    const markdown = formatWeekExport(1, [
      { segment: 1, options: [{ skill: "history", dc: 10, voters: [] }] },
      { segment: 2, options: [{ skill: "nature", dc: 11, voters: [] }] },
    ]);

    expect(markdown).toContain("Day 1 (Day)");
    expect(markdown).toContain("Day 1 (Night)");
  });
});
