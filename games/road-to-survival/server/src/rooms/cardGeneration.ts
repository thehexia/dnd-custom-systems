export const SKILLS = [
  "acrobatics",
  "animal-handling",
  "arcana",
  "athletics",
  "deception",
  "history",
  "insight",
  "intimidation",
  "investigation",
  "medicine",
  "nature",
  "perception",
  "performance",
  "persuasion",
  "religion",
  "sleight-of-hand",
  "stealth",
  "survival",
] as const;

export type Skill = (typeof SKILLS)[number];

export interface CardOption {
  skill: Skill;
  dc: number;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function sampleDistinctSkills(count: number): Skill[] {
  const pool = [...SKILLS];
  const result: Skill[] = [];
  for (let i = 0; i < count; i++) {
    const index = randomInt(0, pool.length - 1);
    result.push(pool[index]);
    pool.splice(index, 1);
  }
  return result;
}

// Rolls the four options' DCs in a fixed tier order (see specs/road-to-survival-skill-check-cards
// - Option DC Tiers): one unconstrained 5-20, one 10-15, and two independent 15-20s. Exported
// separately from generateCard so tier bounds can be tested without needing to reverse a shuffle.
export function rollDcTiers(): [number, number, number, number] {
  return [randomInt(5, 20), randomInt(10, 15), randomInt(15, 20), randomInt(15, 20)];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function generateCard(): CardOption[] {
  const skills = sampleDistinctSkills(4);
  const dcs = rollDcTiers();
  const options: CardOption[] = skills.map((skill, i) => ({ skill, dc: dcs[i] }));
  return shuffle(options);
}
