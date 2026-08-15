## Context

The client currently has two unrelated visual languages: `index.html`'s CSS theme for the room gate modal and connection-status banner (flat dark grays, `system-ui` sans-serif, a neon-green `#3ddc97` accent), and the game HUD / timeline board's already-brownish palette (`#2b1f14` background, `#4a2e1d` border, `#f2b705` accent, `#f2e6c9`/`#d8c9a3` text — introduced piecemeal across earlier changes, most recently the vertical timeline nav bar). The timeline board is Phaser-canvas-rendered (`MainScene.ts`, `Graphics` fills + `Text` objects); the room gate, HUD, and connection banner are Preact-rendered DOM styled by plain CSS in `index.html`. See proposal.md - Why for the motivating reference image and proposal.md - Capabilities for the new `road-to-survival-visual-theme` capability this implements.

## Goals / Non-Goals

**Goals:**
- Apply one consistent, concretely-sourced visual theme (palette, typography, iconography, texture/panel treatment) across both the DOM layer (CSS) and the Phaser canvas layer (`MainScene.ts`).
- Use only real, verified, freely-licensed asset sources — no fabricated URLs, no paid/commissioned art.
- Self-host every asset (fonts, textures, icons) rather than depend on a third-party CDN or hotlinking at runtime.
- Satisfy the attribution requirement for any CC BY-licensed asset used.

**Non-Goals:**
- The character-portrait/skill-check/resource systems shown in the reference image (explicitly out of scope — see proposal.md, "visual restyle only").
- Bespoke/commissioned illustration — this design only integrates existing free asset packs.
- Any change to room gate, HUD, or timeline board layout, interaction, or game behavior.

## Decisions

**Concrete asset sources (verified during planning, not guessed):**

| Use | Asset | License | Source |
|---|---|---|---|
| Display font (headings, banners, week/day labels) | MedievalSharp | OFL (Google Fonts) | https://fonts.google.com/specimen/MedievalSharp |
| Body font (roster, buttons, body text) | IM Fell English | OFL (Google Fonts) | https://fonts.google.com/specimen/IM+Fell+English |
| Parchment background texture | "Parchment background" by Felis Chaus | CC0 | https://opengameart.org/content/parchment-background |
| Panel corner-bracket mask shape | Kenney "Fantasy UI Borders" (`panel-001.png`) | CC0 | https://kenney.nl/assets/fantasy-ui-borders |
| Wood-grain fill texture | "Seamless Wood Textures" (Wood01) by GGBotNet — the Kenney pack above turned out to be untextured line-art frame shapes, not wood-grain art, so a real wood texture was sourced separately to fill those frames/panels | CC0 | https://opengameart.org/content/seamless-wood-textures-0 |
| Day-time tile icon | "Sun" by lorc | CC BY 3.0 | https://game-icons.net/1x1/lorc/sun.html |
| Night-time tile icon | "Moon" by lorc | CC BY 3.0 | https://game-icons.net/1x1/lorc/moon.html |

Chosen over alternatives (paid packs, hand-illustrating new art) because they're free, real, permissively licensed, and already match the reference image's hand-drawn/tabletop aesthetic — no bespoke art production needed for a restyle-only change.

**Self-host all assets under `games/road-to-survival/client/public/theme/` (`fonts/`, `textures/`, `icons/`), rather than linking to Google Fonts' CDN or hotlinking OpenGameArt/Kenney/game-icons.net at runtime.** Avoids an external network dependency for the game to render (works in offline dev, e2e, and any environment without third-party access), avoids Google Fonts' request-time tracking, and isn't subject to those sites changing or removing files later. Each asset is downloaded once during implementation and committed as a static file; `ATTRIBUTIONS.md` records its origin for provenance, not as a live dependency.

**DOM layer (`index.html`): CSS custom properties for the shared palette, `@font-face` for the two self-hosted fonts, parchment background-image + Kenney border-image/panel art on `.room-gate-panel`, `.game-hud`, `.connection-status-banner`.** Reuses the existing amber/brown hex values already established by the HUD/board (`#2b1f14`, `#4a2e1d`, `#f2b705`, `#f2e6c9`, `#d8c9a3`) as the canonical palette instead of inventing new colors, and retires the mismatched room-gate green (`#3ddc97`) and flat connection-banner red/amber. `roomGate.tsx`, `gameHud.tsx`, `connectionStatus.tsx` markup/class names stay as-is; only the CSS changes, keeping this a styling-only diff in those files.

**Phaser canvas layer (`MainScene.ts`): augment the existing `Graphics`-drawn tiles with a wood-grain texture overlay and a sun/moon `Image` per tile, rather than replacing the tile-drawing system.** The current completed/current/selected/upcoming alpha and border logic (`tileVisualState`, unit-tested in `timeline.test.ts`) already works; layering a texture and icon on top preserves that logic and its tests instead of rewriting tile rendering around image-based nine-slices. Requires adding a `preload()` method to `MainScene` (it doesn't have one today) to load the wood texture and sun/moon images before `create()` runs.

**Font-loading order for Phaser `Text` objects.** Phaser's `Text` game objects render via the Canvas 2D API, which needs the browser to have already parsed the custom `@font-face` before `add.text(...)` runs — otherwise the text renders in a fallback font and does not automatically re-render once the real font finishes loading. Mitigation: in `main.ts`, `await document.fonts.load(...)` (or `document.fonts.ready`) for both theme fonts before constructing `new Phaser.Game(...)`, accepting a small delay in game boot rather than a fallback-font flash or permanently-wrong-font canvas text.

**Attribution mechanism.** Add a small "Credits" control (e.g., a footer link on the room gate, or a corner badge alongside the existing server-started badge) that opens a lightweight Preact panel listing attribution-required assets (currently: the two game-icons.net sun/moon icons by "lorc", CC BY 3.0) with author and license. Separately, add `games/road-to-survival/ATTRIBUTIONS.md` recording every sourced asset (CC0 ones included, as good practice) with source URL, author, license, and the local file path it was saved to.

## Risks / Trade-offs

- **Font-loading race causing a flash of fallback-font text, or Phaser canvas text stuck in the wrong font** → Mitigation: await font loading before `new Phaser.Game(...)` (see Decisions).
- **Wood-grain/parchment texture reducing text legibility, especially small HUD text** → Mitigation: keep text on flatter, higher-contrast panel regions rather than directly over busy wood grain; the new "Themed text remains legible" spec scenario is a concrete check for this during manual verification.
- **CC BY 3.0 icon attribution getting dropped in a future edit** → Mitigation: recorded in two places (`ATTRIBUTIONS.md` and the in-game credits panel), not just a code comment.
- **Source sites (Kenney/OpenGameArt/game-icons.net) changing or removing files later** → Mitigation: assets are downloaded once and committed to the repo; nothing depends on those URLs at runtime.
- **Asset file size added to the client bundle** → Low risk: these are UI-scale PNG/JPG/SVG/WOFF2 files (tens of KB per the confirmed pack/file sizes, not MBs), served as static files from `public/`; not expected to materially affect load time.

## Migration Plan

Purely a client-side visual change — no server, schema, or gameplay-behavior changes, so this ships as a normal client release with no feature flag or data migration. Rollback is a plain revert of the client commit(s); unused committed asset files are harmless if reverted.
