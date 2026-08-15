export type TimeOfDay = "day" | "night";

export interface SegmentDescription {
  day: number;
  timeOfDay: TimeOfDay;
}

export function describeSegment(segment: number): SegmentDescription {
  return {
    day: Math.ceil(segment / 2),
    timeOfDay: segment % 2 === 1 ? "day" : "night",
  };
}
