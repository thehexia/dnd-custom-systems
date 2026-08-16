import type { Room } from "colyseus.js";
import { getStateCallbacks } from "colyseus.js";
import Phaser from "phaser";
import { canVoteOnSegment, formatVoters, skillIconKey, skillIconPath, skillLabel, SKILL_SLUGS } from "./skillCheckCard";
import { computeVerticalTileLayout, describeSegment, iconKeyForTimeOfDay, nextSelectedSegment, tileVisualState } from "./timeline";

const CONTENT_LEFT = 56;
const CONTENT_TOP = 64;

// The skill-check content card sits below the day/time-of-day text, filling the rest of the
// content card area with the segment's 4 options (see specs/road-to-survival-skill-check-cards).
const OPTIONS_TOP = CONTENT_TOP + 64;
const OPTION_ROW_HEIGHT = 76;
const OPTION_ROW_GAP = 14;
const OPTION_ICON_SIZE = 40;
const OPTION_ICON_LEFT = CONTENT_LEFT;
const OPTION_TEXT_LEFT = OPTION_ICON_LEFT + OPTION_ICON_SIZE + 18;
const OPTION_VOTED_FILL = 0x2b4a2f;
const OPTION_VOTED_ALPHA = 0.5;

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

// The board's ambient theme (sky color behind the panels, plus a star field) tracks whichever
// segment is currently being viewed and crossfades between these two states -- distinct from
// the per-tile day/night fills above, which never animate.
const DAY_SKY = 0xf8f6d8;
const NIGHT_SKY = 0x12131f;
const STAR_COUNT = 60;
const THEME_TRANSITION_MS = 700;

// weekText and jumpButton sit directly on the sky (they're positioned above the nav bar, not
// on the content card), so their color has to crossfade with the sky too -- otherwise the
// near-white DAY_SKY leaves the light "night" text color unreadable during the day.
const WEEK_TEXT_DAY = 0x2b1f14;
const WEEK_TEXT_NIGHT = 0xfdf4dd;
const JUMP_BUTTON_DAY = 0x1d5f86;
const JUMP_BUTTON_NIGHT = 0x9fd3f2;

interface NavLayout {
  navX: number;
  tileHeight: number;
  positions: number[];
  total: number;
}

interface OptionRow {
  background: Phaser.GameObjects.Graphics;
  zone: Phaser.GameObjects.Zone;
  icon: Phaser.GameObjects.Image;
  skillText: Phaser.GameObjects.Text;
  dcText: Phaser.GameObjects.Text;
  votersText: Phaser.GameObjects.Text;
}

// Minimal shape of the colyseus-decoded schema state this scene reads for a segment's card --
// room.state itself has no shared compile-time type with the server (colyseus.js decodes the
// schema generically over the wire), so this just documents/narrows what's accessed here.
interface SegmentCardOptionStateLike {
  skill: string;
  dc: number;
  voters: string[];
}

interface SegmentCardStateLike {
  options: SegmentCardOptionStateLike[];
}

interface Star {
  obj: Phaser.GameObjects.Arc;
  baseAlpha: number;
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

function rgbToCss({ r, g, b }: { r: number; g: number; b: number }): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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
  private stars: Star[] = [];
  private starVisibility = 0;
  private weekTextColor = WEEK_TEXT_NIGHT;
  private jumpButtonColor = JUMP_BUTTON_NIGHT;
  private skyTween: Phaser.Tweens.Tween | null = null;
  private isDayTheme: boolean | null = null;
  private isAdmin = false;
  private optionRows: OptionRow[] = [];
  private cardSubscriptions = new Set<string>();

  constructor() {
    super("main");
  }

  init(data: { room: Room }) {
    this.room = data.room;
  }

  preload() {
    this.load.svg("sun", "/theme/icons/sun.svg", { width: 64, height: 64 });
    this.load.svg("moon", "/theme/icons/moon.svg", { width: 64, height: 64 });
    for (const skill of SKILL_SLUGS) {
      this.load.svg(skillIconKey(skill), skillIconPath(skill), { width: 64, height: 64 });
    }
  }

  create() {
    this.cameras.main.setBackgroundColor(NIGHT_SKY);
    this.createStarField();
    this.drawContentCard();

    this.track = this.add.graphics();
    this.weekText = this.add.text(0, WEEK_TEXT_TOP, "", {
      fontSize: "24px",
      fontFamily: FONT_DISPLAY,
      color: "#fdf4dd",
    });
    this.jumpButton = this.add.text(0, JUMP_BUTTON_TOP, "▲ Jump to current day", {
      fontSize: "14px",
      fontFamily: FONT_BODY,
      color: "#9fd3f2",
    });
    this.dayText = this.add.text(CONTENT_LEFT, CONTENT_TOP, "", {
      fontSize: "28px",
      fontFamily: FONT_DISPLAY,
      color: "#fdf4dd",
    });
    this.createOptionRows();

    // room.state's nested fields (timeline, players) can briefly be undefined right after
    // join/create resolves, before the first full state sync is decoded -- wait for it instead
    // of reading/subscribing immediately, which would throw.
    this.whenTimelineReady(() => {
      this.isAdmin = this.room.state.players.get(this.room.sessionId)?.isAdmin ?? false;
      this.setUpNavBar();
      if (this.isAdmin) {
        this.jumpButton.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
          if (this.room.state.timeline) {
            this.selectSegment(this.room.state.timeline.segment);
          }
        });
      }
      const $ = getStateCallbacks(this.room);
      $(this.room.state).timeline.onChange(() => this.renderTimeline());
      $(this.room.state).timeline.cards.onAdd((card: SegmentCardStateLike, segmentKey: string) =>
        this.subscribeToCard(segmentKey, card),
      );
      this.renderTimeline();
    });
  }

  // Each option's `voters` array is nested two levels below `timeline` (timeline -> cards map ->
  // card -> option -> voters), deeper than colyseus schema's `onChange` on `timeline` alone
  // reaches -- so a vote arriving on an already-synced card needs its own subscription, one per
  // option, registered once per segment the first time that segment's card is seen.
  private subscribeToCard(segmentKey: string, card: SegmentCardStateLike): void {
    if (this.cardSubscriptions.has(segmentKey)) return;
    this.cardSubscriptions.add(segmentKey);

    const $ = getStateCallbacks(this.room);
    for (const option of card.options) {
      $(option).voters.onAdd(() => this.renderTimeline());
      $(option).voters.onRemove(() => this.renderTimeline());
    }
  }

  private navX(): number {
    return this.scale.width - NAV_RIGHT_MARGIN - NAV_TILE_WIDTH;
  }

  // Scattered once up front (behind the content card and nav bar, since it's the first thing
  // added to the scene) and faded in/out by the day/night theme transition rather than
  // recreated -- their positions and per-star brightness stay fixed for the scene's lifetime.
  private createStarField(): void {
    for (let i = 0; i < STAR_COUNT; i++) {
      const x = Phaser.Math.Between(0, this.scale.width);
      const y = Phaser.Math.Between(0, this.scale.height);
      const radius = Phaser.Math.FloatBetween(0.6, 1.8);
      const baseAlpha = Phaser.Math.FloatBetween(0.3, 0.9);
      const obj = this.add.circle(x, y, radius, 0xfdf4dd, 0);
      this.stars.push({ obj, baseAlpha });
    }
  }

  // Crossfades the camera's background color, the star field's opacity, and the sky-mounted
  // text colors between the day and night ambience. The first call (isDayTheme still null)
  // applies instantly so there's no fade-in from the scene's initial paint; every change after
  // that tweens.
  private applyDayNightTheme(isDay: boolean): void {
    if (this.isDayTheme === isDay) return;
    const animate = this.isDayTheme !== null;
    this.isDayTheme = isDay;
    document.documentElement.dataset.timeOfDay = isDay ? "day" : "night";

    const targetSky = isDay ? DAY_SKY : NIGHT_SKY;
    const targetStars = isDay ? 0 : 1;
    const targetWeekText = isDay ? WEEK_TEXT_DAY : WEEK_TEXT_NIGHT;
    const targetJumpButton = isDay ? JUMP_BUTTON_DAY : JUMP_BUTTON_NIGHT;

    if (!animate) {
      this.cameras.main.setBackgroundColor(targetSky);
      this.starVisibility = targetStars;
      for (const star of this.stars) star.obj.setAlpha(star.baseAlpha * targetStars);
      this.weekTextColor = targetWeekText;
      this.jumpButtonColor = targetJumpButton;
      this.weekText.setColor(rgbToCss(Phaser.Display.Color.IntegerToRGB(targetWeekText)));
      this.jumpButton.setColor(rgbToCss(Phaser.Display.Color.IntegerToRGB(targetJumpButton)));
      return;
    }

    this.skyTween?.stop();
    const fromSky = Phaser.Display.Color.IntegerToColor(this.cameras.main.backgroundColor.color);
    const toSky = Phaser.Display.Color.IntegerToColor(targetSky);
    const fromStars = this.starVisibility;
    const fromWeekText = Phaser.Display.Color.IntegerToColor(this.weekTextColor);
    const toWeekText = Phaser.Display.Color.IntegerToColor(targetWeekText);
    const fromJumpButton = Phaser.Display.Color.IntegerToColor(this.jumpButtonColor);
    const toJumpButton = Phaser.Display.Color.IntegerToColor(targetJumpButton);
    const proxy = { t: 0 };

    this.skyTween = this.tweens.add({
      targets: proxy,
      t: 1,
      duration: THEME_TRANSITION_MS,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        const blendedSky = Phaser.Display.Color.Interpolate.ColorWithColor(fromSky, toSky, 100, proxy.t * 100);
        this.cameras.main.setBackgroundColor(Phaser.Display.Color.GetColor(blendedSky.r, blendedSky.g, blendedSky.b));
        this.starVisibility = Phaser.Math.Linear(fromStars, targetStars, proxy.t);
        for (const star of this.stars) star.obj.setAlpha(star.baseAlpha * this.starVisibility);

        const blendedWeekText = Phaser.Display.Color.Interpolate.ColorWithColor(fromWeekText, toWeekText, 100, proxy.t * 100);
        this.weekTextColor = Phaser.Display.Color.GetColor(blendedWeekText.r, blendedWeekText.g, blendedWeekText.b);
        this.weekText.setColor(rgbToCss(blendedWeekText));

        const blendedJumpButton = Phaser.Display.Color.Interpolate.ColorWithColor(fromJumpButton, toJumpButton, 100, proxy.t * 100);
        this.jumpButtonColor = Phaser.Display.Color.GetColor(blendedJumpButton.r, blendedJumpButton.g, blendedJumpButton.b);
        this.jumpButton.setColor(rgbToCss(blendedJumpButton));
      },
    });
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

  // The 4 option rows' geometry is fixed (always exactly 4 options per card), so -- like the nav
  // bar tiles and the content card panel itself -- they're created once up front; renderCard()
  // only ever updates their content, textures, and interactive state.
  private createOptionRows(): void {
    const rowWidth = this.navX() - CARD_RIGHT_GAP - CONTENT_LEFT - (CONTENT_LEFT - CARD_LEFT);

    for (let i = 0; i < 4; i++) {
      const y = OPTIONS_TOP + i * (OPTION_ROW_HEIGHT + OPTION_ROW_GAP);

      const background = this.add.graphics();
      const zone = this.add.zone(CONTENT_LEFT, y, rowWidth, OPTION_ROW_HEIGHT).setOrigin(0, 0);
      const icon = this.add.image(OPTION_ICON_LEFT + OPTION_ICON_SIZE / 2, y + OPTION_ROW_HEIGHT / 2, "sun").setDisplaySize(OPTION_ICON_SIZE, OPTION_ICON_SIZE);
      const skillText = this.add.text(OPTION_TEXT_LEFT, y + 8, "", {
        fontSize: "18px",
        fontFamily: FONT_DISPLAY,
        color: "#fdf4dd",
      });
      const dcText = this.add.text(OPTION_TEXT_LEFT, y + 34, "", {
        fontSize: "13px",
        fontFamily: FONT_BODY,
        color: "#ecdcb3",
      });
      const votersText = this.add.text(OPTION_TEXT_LEFT, y + 54, "", {
        fontSize: "12px",
        fontFamily: FONT_BODY,
        color: "#9fd3f2",
      });

      const optionIndex = i;
      zone.on("pointerdown", () => this.room.send("vote-skill-check", { optionIndex }));

      this.optionRows.push({ background, zone, icon, skillText, dcText, votersText });
    }
  }

  // Renders the selected segment's skill-check card into the already-created option rows (see
  // createOptionRows). Reads live off room.state rather than caching card data locally -- the
  // MapSchema/ArraySchema instances are mutated in place by colyseus.js as patches arrive.
  private renderCard(): void {
    if (this.selectedSegment === null) return;
    const card: SegmentCardStateLike | undefined = this.room.state.timeline.cards.get(String(this.selectedSegment));
    const votable = canVoteOnSegment(this.selectedSegment, this.room.state.timeline.segment, this.room.state.timeline.phase);

    for (let i = 0; i < this.optionRows.length; i++) {
      const row = this.optionRows[i];
      const option = card?.options[i];

      row.background.clear();
      if (!option) {
        row.icon.setVisible(false);
        row.skillText.setText("");
        row.dcText.setText("");
        row.votersText.setText("");
        row.zone.disableInteractive();
        continue;
      }

      const hasVoted = option.voters.length > 0;
      if (hasVoted) {
        row.background.fillStyle(OPTION_VOTED_FILL, OPTION_VOTED_ALPHA);
        row.background.fillRoundedRect(CONTENT_LEFT, row.zone.y, row.zone.width, OPTION_ROW_HEIGHT, 8);
      }

      row.icon.setVisible(true).setTexture(skillIconKey(option.skill)).setTintFill(0xfdf4dd);
      row.skillText.setText(skillLabel(option.skill));
      row.dcText.setText(`DC ${option.dc}`);
      row.votersText.setText(formatVoters(option.voters));

      if (votable) {
        row.zone.setInteractive({ useHandCursor: true });
      } else {
        row.zone.disableInteractive();
      }
    }

    this.syncCardToDom(card, votable);
  }

  // Canvas-rendered card content has no DOM representation for e2e tests to read, so mirror it
  // the same way tile icons and the selected segment already are (see syncTileIconsToDom /
  // syncSelectionToDom).
  private syncCardToDom(card: SegmentCardStateLike | undefined, votable: boolean): void {
    const container = document.getElementById("app");
    if (!container) return;
    container.dataset.cardVotable = String(votable);
    container.dataset.cardOptions = card
      ? JSON.stringify(card.options.map((o) => ({ skill: o.skill, dc: o.dc, voters: [...o.voters] })))
      : "";
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
      const zone = this.add.zone(navX, y, NAV_TILE_WIDTH, tileHeight).setOrigin(0, 0);
      if (this.isAdmin) {
        zone.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.selectSegment(i));
      }
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
    this.applyDayNightTheme(timeOfDay === "day");
    this.renderCard();

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
