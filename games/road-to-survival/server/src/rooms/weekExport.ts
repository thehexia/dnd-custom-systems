import { describeSegment } from "./timeline.js";

export interface WeekExportOption {
  skill: string;
  dc: number;
  voters: string[];
}

export interface WeekExportSegment {
  segment: number;
  options: WeekExportOption[];
}

function skillLabel(skill: string): string {
  return skill
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Formats every segment already present in `segments` (a segment that hasn't been generated yet
// is simply absent from the caller's data, so it's skipped here rather than treated as an error --
// see specs/road-to-survival-week-roll-export - Export Covers Every Segment of the Current Week).
export function formatWeekExport(week: number, segments: WeekExportSegment[]): string {
  const ordered = [...segments].sort((a, b) => a.segment - b.segment);

  const lines: string[] = [`# Week ${week} Rolls`, ""];

  for (const { segment, options } of ordered) {
    const { day, timeOfDay } = describeSegment(segment);
    const timeOfDayLabel = timeOfDay === "day" ? "Day" : "Night";
    lines.push(`## Segment ${segment} — Day ${day} (${timeOfDayLabel})`, "");
    lines.push("| Skill | DC | Voters |", "| --- | --- | --- |");
    for (const option of options) {
      const voters = option.voters.length > 0 ? option.voters.join(", ") : "No votes";
      lines.push(`| ${skillLabel(option.skill)} | ${option.dc} | ${voters} |`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
