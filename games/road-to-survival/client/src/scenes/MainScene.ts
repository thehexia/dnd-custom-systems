import type { Room } from "colyseus.js";
import { getStateCallbacks } from "colyseus.js";
import Phaser from "phaser";
import { computeVerticalTileLayout, describeSegment, iconKeyForTimeOfDay, nextSelectedSegment, tileVisualState } from "./timeline";

const CONTENT_LEFT = 56;
const CONTENT_TOP = 64;

const NAV_TILE_WIDTH = 190;
const NAV_RIGHT_MARGIN = 40;
const NAV_TOP = 140;
const NAV_BOTTOM_MARGIN = 40;
const TILE_GAP = 22;
const TILE_BEVEL = 10;
const MIN_TILE_HEIGHT = 28;

const WEEK_TEXT_TOP = 36;
const JUMP_BUTTON_TOP = 86;

// The selected/viewed segment's content area is presented as its own card, matching the dark
// glass + gold accent + bevelled-corner treatment used for the DOM surfaces (room gate, HUD)
// instead of floating text directly on the board background.
const CARD_LEFT = 28;
const CARD_TOP = 28;
const CARD_RIGHT_GAP = 28;
const CARD_BOTTOM_MARGIN = 40;
const CARD_BEVEL = 20;
const CARD_BORDER_WIDTH = 1;
const CARD_ACCENT_WIDTH = 4;

const PANEL_FILL = 0x181410;
const PANEL_FILL_ALPHA = 0.94;
const PANEL_BORDER = 0xffc61a;
const PANEL_BORDER_ALPHA = 0.28;
const ACCENT = 0xffc61a;

const DAY_FILL = 0xf2c14e;
const NIGHT_FILL = 0x232a42;
const BORDER = 0x4a4030;
const CURRENT_BORDER = 0xffc61a;
const SELECTED_BORDER = 0x59c1f2;

const DAY_ICON_TINT = 0x2b1f14;
const NIGHT_ICON_TINT = 0xfdf4dd;

const FONT_DISPLAY = "MedievalSharp";
const FONT_BODY = "IM Fell English";

interface NavLayout {
  navX: number;
  tileHeight: number;
  positions: number[];
  total: number;
}

// A rectangle with its top-left and bottom-right corners sliced off, matching the CSS
// clip-path used for the DOM glass panels -- gives Graphics.fillPoints/strokePoints a shape
// to draw instead of a plain or rounded rect.
function bevelledRectPoints(x: number, y: number, width: number, height: number, cut: number): Phaser.Types.Math.Vector2Like[] {
  return [
    { x: x + cut, y },
    { x: x + width, y },
    { x: x + width, y: y + height - cut },
    { x: x + width - cut, y: y + height },
    { x, y: y + height },
    { x, y: y + cut },
  ];
}

export class MainScene extends Phaser.Scene {
  private room!: Room;
  private track!: Phaser.GameObjects.Graphics;
  private weekText!: Phaser.GameObjects.Text;
  private dayText!: Phaser.GameObjects.Text;
  private jumpButton!: Phaser.GameObjects.Text;
  private tileZones: Phaser.GameObjects.Zone[] = [];
  private tileIcons: Phaser.GameObjects.Image[] = [];
  private navLayout: NavLayout | null = null;
  private selectedSegment: number | null = null;
  private lastKnownCurrentSegment: number | null = null;

  constructor() {
    super("main");
  }

  init(data: { room: Room }) {
    this.room = data.room;
  }

  preload() {
    this.load.svg("sun", "/theme/icons/sun.svg", { width: 64, height: 64 });
    this.load.svg("moon", "/theme/icons/moon.svg", { width: 64, height: 64 });
  }

  create() {
    this.drawContentCard();

    this.track = this.add.graphics();
    this.weekText = this.add.text(0, WEEK_TEXT_TOP, "", {
      fontSize: "24px",
      fontFamily: FONT_DISPLAY,
      color: "#fdf4dd",
    });
    this.jumpButton = this.add
      .text(0, JUMP_BUTTON_TOP, "▲ Jump to current day", {
        fontSize: "14px",
        fontFamily: FONT_BODY,
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
      fontFamily: FONT_DISPLAY,
      color: "#fdf4dd",
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

  private navX(): number {
    return this.scale.width - NAV_RIGHT_MARGIN - NAV_TILE_WIDTH;
  }

  // The card's geometry only depends on the canvas size (fixed) and layout constants, not on
  // room state, so it's drawn once up front rather than waiting for the timeline to be ready.
  private drawContentCard(): void {
    const width = this.navX() - CARD_RIGHT_GAP - CARD_LEFT;
    const height = this.scale.height - CARD_TOP - CARD_BOTTOM_MARGIN;
    const points = bevelledRectPoints(CARD_LEFT, CARD_TOP, width, height, CARD_BEVEL);

    const card = this.add.graphics();
    card.fillStyle(PANEL_FILL, PANEL_FILL_ALPHA);
    card.fillPoints(points, true);
    card.lineStyle(CARD_BORDER_WIDTH, PANEL_BORDER, PANEL_BORDER_ALPHA);
    card.strokePoints(points, true);

    // Gold left accent edge, matching the DOM glass panels' border-left -- drawn along the
    // shape's straight left edge only, between the top bevel cut and the bottom-left corner.
    card.fillStyle(ACCENT, 1);
    card.fillRect(CARD_LEFT, CARD_TOP + CARD_BEVEL, CARD_ACCENT_WIDTH, height - CARD_BEVEL);
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
    const navX = this.navX();
    const availableHeight = this.scale.height - NAV_TOP - NAV_BOTTOM_MARGIN;
    const { tileHeight, positions } = computeVerticalTileLayout(total, availableHeight, TILE_GAP, MIN_TILE_HEIGHT);

    this.navLayout = { navX, tileHeight, positions, total };
    this.weekText.setX(navX);
    this.jumpButton.setX(navX);

    const tileIconKeys: string[] = [];

    for (let i = 1; i <= total; i++) {
      const y = NAV_TOP + positions[i - 1];
      const zone = this.add
        .zone(navX, y, NAV_TILE_WIDTH, tileHeight)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.selectSegment(i));
      this.tileZones.push(zone);

      const timeOfDay = describeSegment(i).timeOfDay;
      const iconKey = iconKeyForTimeOfDay(timeOfDay);
      const iconSize = Math.min(tileHeight * 0.7, 32);
      const icon = this.add
        .image(navX + NAV_TILE_WIDTH / 2, y + tileHeight / 2, iconKey)
        .setDisplaySize(iconSize, iconSize)
        .setTintFill(timeOfDay === "day" ? DAY_ICON_TINT : NIGHT_ICON_TINT);
      this.tileIcons.push(icon);
      tileIconKeys.push(iconKey);
    }

    this.syncTileIconsToDom(tileIconKeys);
  }

  // Mirrors each tile's fixed sun/moon icon assignment onto the game container as JSON, the
  // same DOM-mirroring approach used for selectedSegment/segmentLabel -- canvas-rendered icons
  // have no DOM representation for e2e tests to read otherwise.
  private syncTileIconsToDom(tileIconKeys: string[]): void {
    const container = document.getElementById("app");
    if (container) {
      container.dataset.tileIcons = JSON.stringify(tileIconKeys);
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

      // A connector line fills the gap above this tile, so the nav bar reads as a timeline
      // (a path through the segments) rather than a stack of disconnected tiles. The path
      // already walked (up to the current segment) is drawn in the accent color.
      if (i > 1) {
        const prevBottom = NAV_TOP + positions[i - 2] + tileHeight;
        const connectorWalked = i - 1 < segment;
        const lineX = navX + NAV_TILE_WIDTH / 2;
        this.track.lineStyle(3, connectorWalked ? CURRENT_BORDER : BORDER, connectorWalked ? 0.9 : 0.5);
        this.track.beginPath();
        this.track.moveTo(lineX, prevBottom);
        this.track.lineTo(lineX, y);
        this.track.strokePath();
      }

      const visual = tileVisualState(i, segment, this.selectedSegment);
      const fill = visual.timeOfDay === "day" ? DAY_FILL : NIGHT_FILL;
      const alpha = visual.isCompleted ? 0.5 : visual.isCurrent ? 1 : 0.35;
      const bevel = Math.min(TILE_BEVEL, tileHeight / 2);
      const points = bevelledRectPoints(navX, y, NAV_TILE_WIDTH, tileHeight, bevel);

      this.track.fillStyle(fill, alpha);
      this.track.fillPoints(points, true);

      if (visual.isCurrent) {
        this.track.lineStyle(4, CURRENT_BORDER, 1);
      } else if (visual.isSelected) {
        this.track.lineStyle(4, SELECTED_BORDER, 1);
      } else {
        this.track.lineStyle(2, BORDER, 1);
      }
      this.track.strokePoints(points, true);
    }
  }
}
