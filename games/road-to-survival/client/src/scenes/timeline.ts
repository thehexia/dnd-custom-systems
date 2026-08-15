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

/**
 * Decides what the nav bar's selected segment should be after the room's current segment
 * changes. The player stays on whatever they last selected, unless they were following the
 * live segment (selectedSegment is unset, or still equal to the previous current segment) --
 * in which case the selection follows the new current segment too.
 */
export function nextSelectedSegment(
  selectedSegment: number | null,
  lastKnownCurrentSegment: number | null,
  currentSegment: number,
): number {
  if (selectedSegment === null || selectedSegment === lastKnownCurrentSegment) {
    return currentSegment;
  }
  return selectedSegment;
}

export interface TileVisualState {
  timeOfDay: TimeOfDay;
  isCompleted: boolean;
  isCurrent: boolean;
  isSelected: boolean;
}

export function tileVisualState(segment: number, currentSegment: number, selectedSegment: number): TileVisualState {
  return {
    timeOfDay: describeSegment(segment).timeOfDay,
    isCompleted: segment < currentSegment,
    isCurrent: segment === currentSegment,
    isSelected: segment === selectedSegment,
  };
}

export interface VerticalTileLayout {
  tileHeight: number;
  /** Y offset of each segment's tile from the top of the nav bar, indexed by segment - 1. */
  positions: number[];
}

export function computeVerticalTileLayout(
  total: number,
  availableHeight: number,
  tileGap: number,
  minTileHeight = 20,
): VerticalTileLayout {
  const tileHeight = Math.max(minTileHeight, availableHeight / total - tileGap);
  const positions = Array.from({ length: total }, (_, index) => index * (tileHeight + tileGap));
  return { tileHeight, positions };
}
