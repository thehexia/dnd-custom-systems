export const DEFAULT_DAYS_PER_WEEK = 5;

export type TimeOfDay = "day" | "night";

export interface SegmentDescription {
  day: number;
  timeOfDay: TimeOfDay;
}

export function normalizeDaysPerWeek(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : DEFAULT_DAYS_PER_WEEK;
}

export function totalSegments(daysPerWeek: number): number {
  return daysPerWeek * 2;
}

export function describeSegment(segment: number): SegmentDescription {
  return {
    day: Math.ceil(segment / 2),
    timeOfDay: segment % 2 === 1 ? "day" : "night",
  };
}
