## 1. Toolchain setup

- [x] 1.1 Add `preact` to `client/package.json` dependencies.
- [x] 1.2 Add `@testing-library/preact` to `client/package.json` devDependencies.
- [x] 1.3 Update `client/tsconfig.json` with `"jsx": "react-jsx"` and `"jsxImportSource": "preact"`.
- [x] 1.4 Confirm `client/vitest.config.ts`'s `test.include` picks up `.tsx` test files (extend the glob if it currently matches `.ts` only) and that its coverage `include`/`exclude` globs still cover the renamed component file(s).

## 2. Component implementation

- [x] 2.1 Create `client/src/ui/roomGate.tsx` with a root `RoomGate` component holding mode state (`link-join` / `tabs` / `created`) and the `showRoomGate(): Promise<Room>` export, per design.md's render/unmount bridging decision.
- [x] 2.2 Implement the link-join form (username input, optional password reveal on `admin-password-required`, remembered-username prefill from `localStorage`) as its own component, matching current `roomGate.ts` behavior for the `?room=` query param flow.
- [x] 2.3 Implement the create/join tabs component: tab switching, the create form, and the join form (including remembered-username prefill once a 6-character code is entered and password reveal on admin-required rejoin).
- [x] 2.4 Implement the room-created panel component: join link / code / password display, individual copy-to-clipboard buttons (reusing the existing clipboard + `execCommand` fallback logic as a plain helper function), and the "Continue" action that resolves the promise.
- [x] 2.5 Preserve all existing `data-*` attributes and class names on rendered elements, per design.md's "Class names and `data-*` attributes stay as-is" decision, so `index.html`'s global CSS and the e2e suite's selectors keep working unmodified.
- [x] 2.6 Delete `client/src/ui/roomGate.ts` once `roomGate.tsx` is verified equivalent (see task 4).

## 3. Test rewrite

- [x] 3.1 Rewrite `client/src/ui/roomGate.test.ts` (or `.tsx`) using `@testing-library/preact`, porting every existing scenario: link-join flow via `?room=` param, create-room success/error, join-room success/error, admin-password-required reveal on both link-join and join forms, remembered-username prefill and no-prefill cases, tab switching, and each of the three copy buttons (success and failure paths).
- [x] 3.2 Run `npm run test` in `games/road-to-survival/client` and confirm the rewritten suite passes and coverage thresholds (80% statements/lines) are still met.

## 4. End-to-end verification

- [x] 4.1 Run `npm run test:e2e` from `games/road-to-survival` and confirm `create-and-join.spec.ts` and `admin-rejoin.spec.ts` pass unmodified against the new component implementation.
- [x] 4.2 Manually smoke-test in a browser via `npm run dev`: create a room, copy each credential, join via the generated link, join via manual code entry, and rejoin as admin with the correct and an incorrect password.
