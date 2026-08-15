## 1. Source and Add Theme Assets

- [ ] 1.1 Download "MedievalSharp" and "IM Fell English" (Google Fonts, OFL license) as self-hosted woff2 files into `games/road-to-survival/client/public/theme/fonts/`
- [ ] 1.2 Download the "Parchment background" texture by Felis Chaus (CC0, https://opengameart.org/content/parchment-background) into `games/road-to-survival/client/public/theme/textures/`
- [ ] 1.3 Download the needed wood-panel/border/button art from Kenney's "Fantasy UI Borders" and/or "UI Pack" (CC0, https://kenney.nl/assets/fantasy-ui-borders, https://kenney.nl/assets/ui-pack) into `games/road-to-survival/client/public/theme/textures/`
- [ ] 1.4 Download the "Sun" and "Moon" icons by lorc (CC BY 3.0, https://game-icons.net/1x1/lorc/sun.html, https://game-icons.net/1x1/lorc/moon.html) into `games/road-to-survival/client/public/theme/icons/`
- [ ] 1.5 Create `games/road-to-survival/ATTRIBUTIONS.md` recording every asset added in 1.1-1.4: source URL, author, license, and local file path

## 2. DOM Theme (Room Gate, Game HUD, Connection Banner)

- [ ] 2.1 In `client/index.html`, add `@font-face` declarations for the two self-hosted fonts and CSS custom properties for the shared palette (reusing the existing `#2b1f14`/`#4a2e1d`/`#f2b705`/`#f2e6c9`/`#d8c9a3` values already used by the HUD/board)
- [ ] 2.2 Restyle `.room-gate-panel` and its form/tab/button styles with the parchment background texture, wood-panel border art, and the new typefaces; retire the `#3ddc97` green accent
- [ ] 2.3 Restyle `.game-hud` (ready button, roster, week-end/game-over panels) with the same parchment/wood/typeface treatment
- [ ] 2.4 Restyle `.connection-status-banner` with the same palette and typefaces, retiring the flat red/amber colors
- [ ] 2.5 Manually verify text legibility against the textured backgrounds on all three surfaces (per the "Themed text remains legible" spec scenario), adjusting panel contrast if needed

## 3. Phaser Canvas Theme (Timeline Board)

- [ ] 3.1 Add a `preload()` method to `MainScene` that loads the wood-panel texture and sun/moon icon images
- [ ] 3.2 Layer a wood-grain texture over each nav bar tile's existing `Graphics` fill, preserving the current completed/current/selected/upcoming alpha and border logic
- [ ] 3.3 Add a pure `iconKeyForTimeOfDay(timeOfDay: TimeOfDay): "sun" | "moon"` helper in `timeline.ts`, and use it in `MainScene` to place a sun or moon `Image` on each tile matching its actual time-of-day
- [ ] 3.4 Unit test `iconKeyForTimeOfDay` in `timeline.test.ts` for both day and night inputs
- [ ] 3.5 Switch `weekText`, `dayText`, and the jump-to-current-day control's `Text` objects to the new theme fonts
- [ ] 3.6 In `main.ts`, await the two theme fonts loading (via the CSS Font Loading API) before constructing `new Phaser.Game(...)`, per design.md's font-loading-order decision

## 4. Attribution UI

- [ ] 4.1 Add a small "Credits" control (e.g., room gate footer link or a corner badge) that opens a Preact panel listing the CC BY-licensed assets (the sun/moon icons) with author and license
- [ ] 4.2 Unit test the credits panel component: renders the attributed asset(s) with author and license text

## 5. Test Suite Updates

- [ ] 5.1 Add an e2e assertion that a day-time segment tile shows the sun icon and a night-time segment tile shows the moon icon (e.g., via a data attribute mirroring the chosen icon key, following the same DOM-mirroring pattern used for `data-selected-segment`/`data-segment-label`)
- [ ] 5.2 Add an e2e assertion that activating the credits control shows the attributed asset(s)

## 6. Manual Verification

- [ ] 6.1 Run the client dev server and visually confirm: room gate, game HUD, connection banner, and timeline board all share the same palette, typefaces, and parchment/wood texture treatment; timeline tiles show sun/moon icons matching their time-of-day; the credits panel lists the attributed assets
