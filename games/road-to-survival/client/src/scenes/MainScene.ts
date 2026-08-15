import type { Room } from "colyseus.js";
import { getStateCallbacks } from "colyseus.js";
import Phaser from "phaser";
import { describeSegment } from "./timeline";

const TRACK_LEFT = 40;
const TRACK_RIGHT_MARGIN = 40;
const TRACK_TOP = 220;
const TILE_HEIGHT = 90;
const TILE_GAP = 6;
const TILE_RADIUS = 10;

const DAY_FILL = 0xe8c784;
const NIGHT_FILL = 0x2e3a59;
const BORDER = 0x4a2e1d;
const CURRENT_BORDER = 0xf2b705;

export class MainScene extends Phaser.Scene {
  private room!: Room;
  private track!: Phaser.GameObjects.Graphics;
  private weekText!: Phaser.GameObjects.Text;
  private dayText!: Phaser.GameObjects.Text;

  constructor() {
    super("main");
  }

  init(data: { room: Room }) {
    this.room = data.room;
  }

  create() {
    this.track = this.add.graphics();
    this.weekText = this.add.text(TRACK_LEFT, 40, "", {
      fontSize: "32px",
      color: "#f2e6c9",
      fontStyle: "bold",
    });
    this.dayText = this.add.text(TRACK_LEFT, 90, "", {
      fontSize: "20px",
      color: "#d8c9a3",
    });

    // room.state's nested fields (timeline, players) can briefly be undefined right after
    // join/create resolves, before the first full state sync is decoded -- wait for it instead
    // of reading/subscribing immediately, which would throw.
    this.whenTimelineReady(() => {
      const $ = getStateCallbacks(this.room);
      $(this.room.state).timeline.onChange(() => this.renderTimeline());
      this.renderTimeline();
    });
  }

  private whenTimelineReady(callback: () => void): void {
    if (this.room.state.timeline) {
      callback();
    } else {
      this.room.onStateChange.once(() => this.whenTimelineReady(callback));
    }
  }

  private renderTimeline(): void {
    const { week, segment, daysPerWeek, phase } = this.room.state.timeline;
    const total = daysPerWeek * 2;

    this.weekText.setText(`Week ${week}`);
    const { day, timeOfDay } = describeSegment(segment);
    const timeOfDayLabel = timeOfDay === "day" ? "Day-time" : "Night-time";
    const phaseLabel = phase === "week-end" ? " -- awaiting the admin's decision" : phase === "game-over" ? " -- the party has fallen" : "";
    this.dayText.setText(`Day ${day}, ${timeOfDayLabel}${phaseLabel}`);

    const trackWidth = this.scale.width - TRACK_LEFT - TRACK_RIGHT_MARGIN;
    const tileWidth = Math.max(20, trackWidth / total - TILE_GAP);

    this.track.clear();
    for (let i = 1; i <= total; i++) {
      const x = TRACK_LEFT + (i - 1) * (tileWidth + TILE_GAP);
      const fill = describeSegment(i).timeOfDay === "day" ? DAY_FILL : NIGHT_FILL;

      let alpha: number;
      let borderColor = BORDER;
      let borderWidth = 3;

      if (i < segment) {
        alpha = 0.5; // completed
      } else if (i === segment) {
        alpha = 1;
        borderColor = CURRENT_BORDER;
        borderWidth = 6;
      } else {
        alpha = 0.35; // upcoming
      }

      this.track.fillStyle(fill, alpha);
      this.track.fillRoundedRect(x, TRACK_TOP, tileWidth, TILE_HEIGHT, TILE_RADIUS);
      this.track.lineStyle(borderWidth, borderColor, 1);
      this.track.strokeRoundedRect(x, TRACK_TOP, tileWidth, TILE_HEIGHT, TILE_RADIUS);
    }
  }
}
