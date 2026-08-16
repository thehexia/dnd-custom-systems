## 1. Gate nav bar interactivity by admin status

- [x] 1.1 In `MainScene`, determine the local player's `isAdmin` status (via `room.state.players.get(this.room.sessionId)?.isAdmin`) inside the `whenTimelineReady` callback, before `setUpNavBar` runs
- [x] 1.2 In `setUpNavBar`, only call `.setInteractive({ useHandCursor: true }).on("pointerdown", ...)` on each tile zone when the local player is admin; non-admin tile zones get no interactive handler at all
- [x] 1.3 Move the jump-to-current-day button's `.setInteractive({ useHandCursor: true }).on("pointerdown", ...)` call out of `create()` and into the `whenTimelineReady` callback, gated the same way as 1.2

## 2. Tests

- [x] 2.1 Add an e2e test in `games/road-to-survival/e2e/tests/timeline-board.spec.ts`: a non-admin player (the second joiner) clicks a nav bar tile for a segment other than the current one, and `data-selected-segment` / `data-segment-label` on `#app` remain unchanged
- [x] 2.2 Add an e2e test confirming the jump-to-current-day control has no interactive affordance for a non-admin player (e.g. clicking its position produces no change and/or its hover cursor is not the hand cursor), while the existing admin-focused nav bar tests continue to pass unchanged

## 3. Verification

- [x] 3.1 Run `npm run test:unit` and `npm run test:e2e` from `games/road-to-survival/` and confirm the full suite passes, including the existing admin-only nav bar tests (`selecting a nav bar segment does not affect the room, and jump-to-current-day returns to it`, `clicking a different nav bar tile updates the selected segment`)
