import { describe, expect, it } from "vitest";
import { generateCard, rollDcTiers, sampleDistinctSkills, SKILLS } from "./cardGeneration.js";

const RUNS = 500;

describe("sampleDistinctSkills", () => {
  it("returns the requested count of distinct skills from the pool", () => {
    for (let i = 0; i < RUNS; i++) {
      const skills = sampleDistinctSkills(4);
      expect(skills).toHaveLength(4);
      expect(new Set(skills).size).toBe(4);
      for (const skill of skills) expect(SKILLS).toContain(skill);
    }
  });
});

describe("rollDcTiers", () => {
  it("keeps every roll within its tier's bounds across many runs", () => {
    for (let i = 0; i < RUNS; i++) {
      const [unconstrained, mid, high1, high2] = rollDcTiers();
      expect(unconstrained).toBeGreaterThanOrEqual(5);
      expect(unconstrained).toBeLessThanOrEqual(20);
      expect(mid).toBeGreaterThanOrEqual(10);
      expect(mid).toBeLessThanOrEqual(15);
      expect(high1).toBeGreaterThanOrEqual(15);
      expect(high1).toBeLessThanOrEqual(20);
      expect(high2).toBeGreaterThanOrEqual(15);
      expect(high2).toBeLessThanOrEqual(20);
    }
  });

  it("eventually rolls the unconstrained tier below 10, outside the mid/high tiers", () => {
    const unconstrainedRolls = Array.from({ length: RUNS }, () => rollDcTiers()[0]);
    expect(unconstrainedRolls.some((dc) => dc < 10)).toBe(true);
  });
});

describe("generateCard", () => {
  it("always has exactly 4 options with distinct skills and in-range DCs", () => {
    for (let i = 0; i < RUNS; i++) {
      const card = generateCard();
      expect(card).toHaveLength(4);
      expect(new Set(card.map((o) => o.skill)).size).toBe(4);
      for (const option of card) {
        expect(option.dc).toBeGreaterThanOrEqual(5);
        expect(option.dc).toBeLessThanOrEqual(20);
      }
    }
  });

  it("does not always place the same tier at the same position (display order is shuffled)", () => {
    // If option order were tier-ordered rather than shuffled, the minimum DC would always land
    // at the same index (the unconstrained slot only "usually" contributes the min, but a fixed
    // non-shuffled order would still produce a stable index distribution far from uniform).
    const minIndexCounts = [0, 0, 0, 0];
    for (let i = 0; i < RUNS; i++) {
      const card = generateCard();
      const minIndex = card.reduce((best, option, index) => (option.dc < card[best].dc ? index : best), 0);
      minIndexCounts[minIndex]++;
    }
    for (const count of minIndexCounts) {
      expect(count).toBeGreaterThan(0);
    }
  });
});
