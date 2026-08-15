import type { Room } from "colyseus.js";
import { getStateCallbacks } from "colyseus.js";
import Phaser from "phaser";
import { computeVerticalTileLayout, describeSegment, nextSelectedSegment, tileVisualState } from "./timeline";

const CONTENT_LEFT = 40;
const CONTENT_TOP = 40;

const NAV_TILE_WIDTH = 150;
const NAV_RIGHT_MARGIN = 30;
const NAV_TOP = 130;
const NAV_BOTTOM_MARGIN = 30;
const TILE_GAP = 6;
const TILE_RADIUS = 10;
const MIN_TILE_HEIGHT = 20;

const WEEK_TEXT_TOP = 30;
const JUMP_BUTTON_TOP = 74;

const DAY_FILL = 0xe8c784;
const NIGHT_FILL = 0x2e3a59;
const BORDER = 0x4a2e1d;
const CURRENT_BORDER = 0xf2b705;
const SELECTED_BORDER = 0x59c1f2;

interface NavLayout {
  navX: number;
  tileHeight: number;
  positions: number[];
  total: number;
}

export class MainScene extends Phaser.Scene {
  private room!: Room;
  private track!: Phaser.GameObjects.Graphics;
  private weekText!: Phaser.GameObjects.Text;
  private dayText!: Phaser.GameObjects.Text;
  private jumpButton!: Phaser.GameObjects.Text;
  private tileZones: Phaser.GameObjects.Zone[] = [];
  private navLayout: NavLayout | null = null;
  private selectedSegment: number | null = null;
  private lastKnownCurrentSegment: number | null = null;

  constructor() {
    super("main");
  }

  init(data: { room: Room }) {
    this.room = data.room;
  }

  create() {
    this.track = this.add.graphics();
    this.weekText = this.add.text(0, WEEK_TEXT_TOP, "", {
      fontSize: "24px",
      color: "#f2e6c9",
      fontStyle: "bold",
    });
    this.jumpButton = this.add
      .text(0, JUMP_BUTTON_TOP, "▲ Jump to current day", {
        fontSize: "14px",
        color: "#9fd3f2",
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        if (this.room.state.timeline) {
          this.selectSegment(this.room.state.timeline.segment);
        }
      });
    this.dayText = this.add.text(CONTENT_LEFT, CONTENT_TOP, "", {
      fontSize: "28px",
      color: "#f2e6c9",
      fontStyle: "bold",
    });

    // room.state's nested fields (timeline, players) can briefly be undefined right after
    // join/create resolves, before the first full state sync is decoded -- wait for it instead
    // of reading/subscribing immediately, which would throw.
    this.whenTimelineReady(() => {
      this.setUpNavBar();
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

  // daysPerWeek is fixed for the lifetime of a room (see the timeline board spec's "Room Admin
  // Configures Week Length" requirement), so the nav bar's tile count and positions never
  // change shape after this -- only their styling is recomputed on each render.
  private setUpNavBar(): void {
    const { daysPerWeek } = this.room.state.timeline;
    const total = daysPerWeek * 2;
    const navX = this.scale.width - NAV_RIGHT_MARGIN - NAV_TILE_WIDTH;
    const availableHeight = this.scale.height - NAV_TOP - NAV_BOTTOM_MARGIN;
    const { tileHeight, positions } = computeVerticalTileLayout(total, availableHeight, TILE_GAP, MIN_TILE_HEIGHT);

    this.navLayout = { navX, tileHeight, positions, total };
    this.weekText.setX(navX);
    this.jumpButton.setX(navX);

    for (let i = 1; i <= total; i++) {
      const y = NAV_TOP + positions[i - 1];
      const zone = this.add
        .zone(navX, y, NAV_TILE_WIDTH, tileHeight)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.selectSegment(i));
      this.tileZones.push(zone);
    }
  }

  private selectSegment(segment: number): void {
    this.selectedSegment = segment;
    this.renderTimeline();
  }

  // Canvas-rendered text has no DOM representation for e2e tests to read, so mirror the
  // selected segment and its displayed label onto the game container as data attributes -- a
  // lightweight, standard way to make canvas-internal UI state observable to Playwright without
  // screenshot diffing.
  private syncSelectionToDom(label: string): void {
    const container = document.getElementById("app");
    if (container && this.selectedSegment !== null) {
      container.dataset.selectedSegment = String(this.selectedSegment);
      container.dataset.segmentLabel = label;
    }
  }

  private renderTimeline(): void {
    if (!this.navLayout) return;

    const { week, segment, phase } = this.room.state.timeline;
    const { navX, tileHeight, positions, total } = this.navLayout;

    this.selectedSegment = nextSelectedSegment(this.selectedSegment, this.lastKnownCurrentSegment, segment);
    this.lastKnownCurrentSegment = segment;

    this.weekText.setText(`Week ${week}`);

    const { day, timeOfDay } = describeSegment(this.selectedSegment);
    const timeOfDayLabel = timeOfDay === "day" ? "Day-time" : "Night-time";
    const phaseLabel = phase === "week-end" ? " -- awaiting the admin's decision" : phase === "game-over" ? " -- the party has fallen" : "";
    const dayLabel = `Day ${day}, ${timeOfDayLabel}${phaseLabel}`;
    this.dayText.setText(dayLabel);
    this.syncSelectionToDom(dayLabel);

    this.track.clear();
    for (let i = 1; i <= total; i++) {
      const y = NAV_TOP + positions[i - 1];
      const visual = tileVisualState(i, segment, this.selectedSegment);
      const fill = visual.timeOfDay === "day" ? DAY_FILL : NIGHT_FILL;
      const alpha = visual.isCompleted ? 0.5 : visual.isCurrent ? 1 : 0.35;

      this.track.fillStyle(fill, alpha);
      this.track.fillRoundedRect(navX, y, NAV_TILE_WIDTH, tileHeight, TILE_RADIUS);

      if (visual.isCurrent) {
        this.track.lineStyle(6, CURRENT_BORDER, 1);
      } else if (visual.isSelected) {
        this.track.lineStyle(6, SELECTED_BORDER, 1);
      } else {
        this.track.lineStyle(3, BORDER, 1);
      }
      this.track.strokeRoundedRect(navX, y, NAV_TILE_WIDTH, tileHeight, TILE_RADIUS);
    }
  }
}
