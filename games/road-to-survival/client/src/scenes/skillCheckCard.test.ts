import { describe, expect, it } from "vitest";
import {
  canInteractWithOption,
  canVoteOnSegment,
  formatVoters,
  hasVotingRights,
  skillIconKey,
  skillIconPath,
  skillLabel,
  SKILL_SLUGS,
} from "./skillCheckCard";

describe("skillLabel", () => {
  it("maps a skill slug to its display name", () => {
    expect(skillLabel("sleight-of-hand")).toBe("Sleight of Hand");
    expect(skillLabel("animal-handling")).toBe("Animal Handling");
    expect(skillLabel("acrobatics")).toBe("Acrobatics");
  });

  it("covers all 18 D&D 5e skills", () => {
    expect(SKILL_SLUGS).toHaveLength(18);
  });
});

describe("skillIconKey / skillIconPath", () => {
  it("derives a distinct texture key and asset path per skill", () => {
    expect(skillIconKey("stealth")).toBe("skill-stealth");
    expect(skillIconPath("stealth")).toBe("/theme/icons/skills/stealth.svg");
  });
});

describe("formatVoters", () => {
  it("returns an empty string for no voters", () => {
    expect(formatVoters([])).toBe("");
  });

  it("joins multiple voters' usernames", () => {
    expect(formatVoters(["alice"])).toBe("alice");
    expect(formatVoters(["alice", "bob"])).toBe("alice, bob");
  });

  it("reflects a vote moving from one option to another as two independent lists", () => {
    const before = { optionA: ["alice"], optionB: [] as string[] };
    const after = { optionA: [] as string[], optionB: ["alice"] };

    expect(formatVoters(before.optionA)).toBe("alice");
    expect(formatVoters(before.optionB)).toBe("");
    expect(formatVoters(after.optionA)).toBe("");
    expect(formatVoters(after.optionB)).toBe("alice");
  });
});

describe("canVoteOnSegment", () => {
  it("allows voting when viewing the room's actual current segment during the active phase", () => {
    expect(canVoteOnSegment(3, 3, "active")).toBe(true);
  });

  it("disables voting when the selected segment differs from the current segment", () => {
    expect(canVoteOnSegment(2, 3, "active")).toBe(false);
  });

  it("disables voting outside the active phase, even on the current segment", () => {
    expect(canVoteOnSegment(3, 3, "week-end")).toBe(false);
    expect(canVoteOnSegment(3, 3, "game-over")).toBe(false);
  });
});

describe("hasVotingRights", () => {
  it("allows voting in normal mode regardless of Lead-token count", () => {
    expect(hasVotingRights("normal", 0)).toBe(true);
    expect(hasVotingRights("normal", 1)).toBe(true);
    expect(hasVotingRights("normal", 2)).toBe(true);
  });

  it("allows voting in hunted mode only when holding at least one Lead token", () => {
    expect(hasVotingRights("hunted", 1)).toBe(true);
    expect(hasVotingRights("hunted", 2)).toBe(true);
    expect(hasVotingRights("hunted", 0)).toBe(false);
  });
});

describe("canInteractWithOption", () => {
  it("is interactive when a new vote or change of option is allowed, regardless of ownership", () => {
    expect(canInteractWithOption(true, false)).toBe(true);
    expect(canInteractWithOption(true, true)).toBe(true);
  });

  it("stays interactive for the player's own already-voted row even when they can't place a vote", () => {
    expect(canInteractWithOption(false, true)).toBe(true);
  });

  it("is not interactive for another row when the player can't place a vote and doesn't own this one", () => {
    expect(canInteractWithOption(false, false)).toBe(false);
  });
});
