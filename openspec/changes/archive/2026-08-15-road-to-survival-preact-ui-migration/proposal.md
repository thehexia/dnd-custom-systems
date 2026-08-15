## Why

`client/src/ui/roomGate.ts` builds its UI with manual `innerHTML` templating, `querySelectorAll`, and `dataset`-based wiring. It already shows the cost of that approach — duplicated selector lookups per form, imperative show/hide toggling across three mutually-exclusive states (link-join, tabs-mode, created), and tests that poke at the DOM directly rather than a component API. The room gate is also expected to grow (more entry states, eventually a live in-game HUD layered over the Phaser canvas), and each addition compounds the boilerplate. Preact gives a component/state model at a fraction of React's bundle size, which matters for a game client, while keeping the same escape hatch (imperative DOM/Phaser writes) needed for any future high-frequency HUD elements.

## What Changes

- Add `preact` as a client dependency and wire up JSX/TSX support in the Vite + TypeScript build.
- Reimplement `roomGate.ts` as one or more Preact components that reproduce the exact current behavior: link-join mode, create/join tabs, password reveal on admin-required rejoin, remembered-username prefill, the room-created share screen, and copy-to-clipboard buttons.
- Preserve the existing `showRoomGate(): Promise<Room>` function signature so `main.ts` does not need to change how it consumes the room gate.
- Rewrite `roomGate.test.ts` to exercise the Preact components (via `@testing-library/preact` or equivalent), replacing the current raw `document.querySelector`/`dispatchEvent` assertions with component-level queries and interactions.
- No other client UI exists yet (`roomGate.ts` is the only DOM-manipulating file under `client/src`), so this change is scoped to that one module.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none — this is a behavior-preserving implementation change; `road-to-survival-room-access` already specifies the observable room-creation/join/rejoin behavior and that spec is not changing)

## Impact

- `games/road-to-survival/client/package.json`: add `preact` dependency (and a JSX-supporting dev dependency if needed, e.g. `@testing-library/preact`).
- `games/road-to-survival/client/tsconfig.json` and `vite.config.ts` (if present) / build config: enable JSX with Preact's `h`/`Fragment` pragma or `preact/compat` aliasing.
- `games/road-to-survival/client/src/ui/roomGate.ts` → replaced by Preact component(s) (e.g. `roomGate.tsx` plus any extracted subcomponents), keeping the same exported `showRoomGate` entry point.
- `games/road-to-survival/client/src/ui/roomGate.test.ts`: rewritten against the new component structure.
- `games/road-to-survival/client/src/main.ts`: no change expected (same `showRoomGate()` import/usage).
- No server-side or spec-level behavior changes.
