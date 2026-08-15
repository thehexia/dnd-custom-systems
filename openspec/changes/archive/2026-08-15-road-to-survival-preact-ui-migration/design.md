## Context

`roomGate.ts` currently builds its markup as a single `innerHTML` template string, then wires behavior with `querySelector`/`querySelectorAll` + `dataset` lookups, and exposes one entry point: `showRoomGate(): Promise<Room>`, called once from `main.ts` before the Phaser game is constructed. All of the module's styling lives as global CSS in `index.html`, keyed off the same class names and `data-*` attributes the current code queries. `client/vitest.config.ts` already runs tests under `jsdom`; `client/tsconfig.json` has no JSX configuration yet since nothing in the client emits JSX today.

## Goals / Non-Goals

**Goals:**
- Replace `roomGate.ts`'s manual DOM wiring with Preact components with equivalent behavior and equivalent visual output (see proposal.md - What Changes for the full behavior list).
- Keep the `showRoomGate(): Promise<Room>` call site in `main.ts` unchanged.
- Reuse the existing global CSS as-is (no CSS rewrite) by keeping the same class names and DOM shape the stylesheet in `index.html` already targets.
- Establish the minimal JSX/Preact toolchain wiring (tsconfig, no extra Vite plugin) so future UI work (a HUD, in-game panels) can use the same setup without re-deciding it.

**Non-Goals:**
- Introducing a shared state store (Zustand/nanostores) or an event bus between Preact and Phaser. Nothing in this change needs to read or write Phaser scene state — `showRoomGate` resolves before `Phaser.Game` is even constructed. That bridge is future work for a live HUD, not this migration.
- Dev-mode fast refresh / `@preact/preset-vite`. Not needed for a one-shot modal; can be added later without touching component code.
- Any visual redesign or CSS changes.
- Migrating `MainScene.ts` or any other file — no other file does manual DOM manipulation today.

## Decisions

### JSX toolchain: tsconfig only, no Preact Vite plugin
Set `"jsx": "react-jsx"` and `"jsxImportSource": "preact"` in `client/tsconfig.json`. Vite's esbuild-based transform reads these tsconfig fields directly, so `.tsx` files compile without adding `@preact/preset-vite`. Vitest uses the same Vite pipeline, so tests need no separate JSX config.
- Alternative considered: `@preact/preset-vite`. Rejected for now — its main value (HMR-aware fast refresh, automatic `react`→`preact/compat` aliasing) isn't needed here since nothing imports the `react` package and this is a one-time modal, not an iteration-heavy surface. Nothing in this decision blocks adding the plugin later.

### Bridging the imperative `Promise<Room>` API with a declarative component tree
`showRoomGate()` keeps its current signature. Internally it creates a container `div`, calls Preact's `render(<RoomGate onResolve={handleResolve} />, container)`, and `handleResolve` both `resolve()`s the promise and unmounts (`render(null, container)`) / removes the container — mirroring the current `finish(room)` helper's `container.remove(); resolve(room)`.
- Alternative considered: converting `main.ts` to consume a callback instead of a promise. Rejected — proposal.md scopes this change to `roomGate.ts` only; changing `main.ts`'s API is unnecessary churn.

### Component structure
One root `RoomGate` component owning the mode state (`link-join` vs. `tabs` vs. `created`) and per-form error state, matching the three mutually-exclusive sections already present in the current template. Split the two tab forms (create/join) and the created-share panel into their own small components, mirroring the existing `data-form`/`data-created` boundaries in the current markup — this keeps each component's props/state small without inventing new structure.
- Alternative considered: one flat component with all markup inline (closest 1:1 port of the current `innerHTML` string). Rejected — the current file's own structure (separate sections, separate submit handlers, separate error paragraphs) already implies these boundaries; keeping them as components is not a new abstraction, just an explicit version of the one implicit in the DOM template today.

### Test rewrite: `@testing-library/preact`
Add `@testing-library/preact` (and `@testing-library/jest-dom` is optional — decide against it; vitest's built-in `expect` plus DOM assertions already cover what's needed) as a dev dependency. Rewrite `roomGate.test.ts` to render components and query by role/label text instead of `document.querySelector` + manual `dispatchEvent(new Event("submit"))`, which is more resilient to internal markup changes and is the standard pairing for Preact + Vitest.
- Alternative considered: keep testing via raw `document.querySelector` against the rendered output (Preact still produces real DOM nodes, so the old test style would technically still work). Rejected — it would keep the tests coupled to `data-*` attributes that this migration is explicitly trying to move away from at the implementation layer; testing-library queries assert on user-visible behavior (labels, roles, text) instead.

### Class names and `data-*` attributes stay as-is
Components render the same class names (`room-gate-panel`, `room-gate-tabs`, `room-gate-form`, etc.) and the same element nesting the current template uses, so the global CSS in `index.html` requires no changes. Components also keep the exact `data-*` attributes the current template uses (`data-form="create"`, `data-form="join"`, `data-form="link-join"`, `data-created`, `data-created-link`, `data-created-code`, `data-created-password`, `data-continue`, `data-link-join`, `data-tab`, `data-copy`, `data-error`, `data-password-field`) — `e2e/tests/create-and-join.spec.ts`, `e2e/tests/admin-rejoin.spec.ts`, and `e2e/tests/helpers.ts` select on these directly (e.g. `'[data-form="create"]'`, `page.locator("[data-created-link]")`) and are out of scope for this change, so they must keep passing unmodified.
- Alternative considered: dropping `data-*` selectors in favor of `data-testid` or role/label-based Playwright locators, matching the more resilient style used in the new unit tests. Rejected for this change — it would require editing the e2e suite too, which the proposal doesn't scope in, and Playwright selector style is an orthogonal concern to the Preact migration; can be revisited separately.

## Risks / Trade-offs

- [Preact's `hidden` prop must map to the DOM `hidden` attribute the same way the current code's `el.hidden = true/false` does, or sections won't toggle] → Preact passes `hidden` through as a DOM property like React does; verify visually during implementation (task-level check, not left as an open question — this is a well-established Preact behavior, not a design risk worth hedging on).
- [Rewriting the test file in the same change as the implementation risks silently losing coverage of an edge case the old dataset-based tests happened to check] → Port the existing test file's scenarios one-for-one into the new file (same list of behaviors: link-join, create, join, admin-password reveal, remembered username, copy buttons, created-panel), only changing the query/interaction style, and keep the old test file in git history for diffing rather than trusting memory of what it covered.
- [Small bundle-size and dependency-surface increase from adding Preact] → Preact's core is ~4kb gzipped; acceptable given the proposal's stated motivation (this is also the tradeoff being deliberately made per the proposal's Why).

## Migration Plan

1. Add `preact` (dependency) and `@testing-library/preact` (dev dependency) to `client/package.json`.
2. Update `client/tsconfig.json` with the JSX settings above.
3. Add the new component file(s) under `client/src/ui/` (e.g. `roomGate.tsx`, replacing `roomGate.ts`) implementing the same exported `showRoomGate`.
4. Port `roomGate.test.ts` to the new component-based queries.
5. Delete the old `roomGate.ts` implementation once the new one is verified behaviorally equivalent (manual check in the browser: create room, join via link, join via code, admin rejoin with password, copy buttons).
6. No server changes, no data migration, no rollback concerns beyond a normal revert (single client-side module swap).
