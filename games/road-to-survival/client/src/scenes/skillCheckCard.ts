// D&D 5e's 18 skills, matching the slugs the server assigns to each card option (see
// server/src/rooms/cardGeneration.ts's SKILLS) and the icon filenames under
// client/public/theme/icons/skills/<slug>.svg.
export const SKILL_LABELS: Record<string, string> = {
  acrobatics: "Acrobatics",
  "animal-handling": "Animal Handling",
  arcana: "Arcana",
  athletics: "Athletics",
  deception: "Deception",
  history: "History",
  insight: "Insight",
  intimidation: "Intimidation",
  investigation: "Investigation",
  medicine: "Medicine",
  nature: "Nature",
  perception: "Perception",
  performance: "Performance",
  persuasion: "Persuasion",
  religion: "Religion",
  "sleight-of-hand": "Sleight of Hand",
  stealth: "Stealth",
  survival: "Survival",
};

export const SKILL_SLUGS = Object.keys(SKILL_LABELS);

export function skillLabel(skill: string): string {
  return SKILL_LABELS[skill] ?? skill;
}

export function skillIconKey(skill: string): string {
  return `skill-${skill}`;
}

export function skillIconPath(skill: string): string {
  return `/theme/icons/skills/${skill}.svg`;
}

export function formatVoters(voters: string[]): string {
  return voters.join(", ");
}

// Voting is only ever accepted by the server for the room's actual current segment (see
// specs/road-to-survival-skill-check-cards - Voting Restricted to the Current Segment), so the
// client must not present the option rows as interactive for any other segment the player might
// be previewing, nor outside the timeline's "active" phase.
export function canVoteOnSegment(selectedSegment: number, currentSegment: number, phase: string): boolean {
  return selectedSegment === currentSegment && phase === "active";
}
