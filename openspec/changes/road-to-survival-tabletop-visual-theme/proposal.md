## Why

Today the game's UI is a patchwork: the room gate (create/join modal) and connection-status banner use a generic flat dark theme (`system-ui` font, neon-green accent, plain grays), while the game HUD and timeline board already lean toward a warm brown/amber "tabletop" look but with flat colors and no real texture, iconography, or lettering to back it up. The user wants the whole game to read as a stylized, hand-drawn tabletop board game — like the reference board game screenshot they provided (parchment panels, wood-grained tiles, sun/moon iconography, hand-lettered banners) — rather than a mix of a default web-app theme and a partially-themed game board.

## What Changes

- Establish a single shared visual theme (color palette, typography, iconography, and panel/texture treatment) evoking a hand-drawn, parchment-and-wood tabletop board game, and apply it consistently across every client UI surface: the room gate modal, the game HUD (ready button, roster, week-end/game-over panels), the connection-status banner, and the Phaser-rendered timeline board (nav bar + content area).
- Replace the current flat `system-ui` sans-serif type with two sourced, freely-licensed fonts: a hand-lettered display face for headings/banners and a rustic serif for body text.
- Replace flat color fills with real texture/panel assets: a parchment background texture and wood-grained panel/border art, sourced from free asset packs, applied to modals, panels, buttons, and the timeline board's tiles.
- Replace the timeline board's plain color-only day/night tile distinction with actual sun/moon iconography (sourced icons), layered on top of the existing completed/current/selected/upcoming states from the vertical nav bar.
- Retire the current mismatched accents (the room gate's neon-green `#3ddc97`, the flat red/amber connection banner) in favor of the unified palette.
- Add an in-game attributions surface (e.g., a small credits panel/footer) crediting any sourced assets whose license requires attribution, plus a NOTICE-style file in the repo recording each asset's source, author, and license.
- **This is a visual restyle only** — no new game mechanics, screens, or data are introduced. The room gate, game HUD, and timeline board keep their existing behavior, layout structure (vertical nav bar + content area), and interactions (ready-up, segment selection, jump-to-current-day); only their look changes.

## Capabilities

### New Capabilities
- `road-to-survival-visual-theme`: Defines the shared hand-drawn tabletop visual theme (palette, typography, iconography, texture/panel treatment, and asset-attribution handling) and requires every client UI surface to conform to it.

### Modified Capabilities
(none — `road-to-survival-timeline-board`'s existing "Timeline Board Presentation" requirement already only requires "the game's tabletop-inspired visual style" without hardcoding specific colors/fonts/assets, so applying a concrete theme does not change that capability's requirements)

## Impact

- `games/road-to-survival/client/index.html`: full CSS rewrite — new `@font-face` declarations, palette variables, parchment/wood-panel backgrounds replacing the flat dark theme for `#room-gate`, `#game-hud`, and `.connection-status-banner`.
- `games/road-to-survival/client/src/scenes/MainScene.ts`: timeline board's `Graphics`-drawn tiles and plain-color day/night fills gain wood-panel texture and sun/moon icon overlays; `Text` objects switch to the new theme fonts (requires the fonts to be loaded before Phaser creates text, a known canvas-text/webfont-timing gotcha — see design.md).
- `games/road-to-survival/client/src/ui/roomGate.tsx`, `gameHud.tsx`, `connectionStatus.tsx`: class names/markup mostly unchanged, but now render against the new CSS theme; may need small structural additions for icon/texture elements.
- New static assets added under the client workspace (fonts, textures, icons) sourced from free/CC-licensed packs, plus an attributions file and a small in-game credits UI element.
- No server-side, schema, or gameplay-behavior changes.
