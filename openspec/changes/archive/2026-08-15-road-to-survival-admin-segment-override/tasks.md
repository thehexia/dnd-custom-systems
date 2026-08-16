## 1. Server: admin segment override

- [x] 1.1 In `GameRoom.ts`, extract `maybeAdvance`'s "increment segment, or enter week-end at the last segment, then reset every player's readiness" body into a private `advanceSegment()` helper, and have `maybeAdvance` call it after its existing all-ready check (behavior unchanged)
- [x] 1.2 Add an `"override-segment"` message handler taking `{ direction: "next" | "previous" }`, gated on the sender being admin (`player?.isAdmin`) and `timeline.phase === "active"`, both checks failing silently (no state change, no error sent)
- [x] 1.3 In the handler, `"next"` calls `advanceSegment()`; `"previous"` decrements `timeline.segment` when it is greater than 1 (leaving week and segment unchanged otherwise) and then resets every connected player's readiness to not-ready

## 2. Client: admin override controls

- [x] 2.1 In `gameHud.tsx`, add next/previous segment buttons to the existing admin-only block, visible during the `"active"` phase, each calling `room.send("override-segment", { direction: "next" | "previous" })`

## 3. Tests

- [x] 3.1 Add server unit/integration test coverage (`GameRoom.integration.test.ts`) for: admin forward override advances the segment and resets readiness even when not all players are ready; admin forward override at the week's last segment enters week-end; admin backward override moves back a segment and resets readiness; admin backward override at segment 1 is a no-op; a non-admin's override attempt is rejected; overrides are rejected during week-end and game-over phases
- [x] 3.2 Add an e2e test in `games/road-to-survival/e2e/tests/timeline-board.spec.ts` covering the admin using the next/previous controls to change the shared segment without both players readying up, and confirming a non-admin does not see the controls

## 4. Verification

- [x] 4.1 Run `npm run test:unit`, `npm run test:integration`, and `npm run test:e2e` from `games/road-to-survival/` and confirm the full suite passes, including existing ready-based advancement and week-end/game-over tests
