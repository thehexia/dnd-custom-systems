## Why

Segment advancement currently requires every connected player to ready up, with no way for the admin to move the shared timeline forward or backward on their own. This blocks the admin from correcting a mistaken advance, skipping a segment nobody needs to play through, or otherwise pacing the game without waiting on the whole party.

## What Changes

- Add an admin-only override that steps the room's actual current segment forward or backward by exactly one, bypassing the all-players-ready requirement.
- Forward override at the week's last segment enters the week-end decision state, the same transition full-ready advancement would trigger.
- Backward override is clamped at segment 1 of the current week; it does not cross into the previous week.
- Either override resets every connected player's ready status for the landed-on segment, matching normal segment advancement.
- The override is only available while the timeline is in the "active" phase; it is rejected during the week-end decision state and the terminal game-over state, consistent with those phases already locking out ready-ups and advancement.
- A non-admin player's attempt to use the override is rejected.

## Capabilities

### Modified Capabilities
- `road-to-survival-timeline-board`: adds an admin-only next/previous segment override that bypasses the ready-based advancement gate, with the same week-end transition and readiness-reset behavior as normal advancement.

## Impact

- Server: `games/road-to-survival/server/src/rooms/GameRoom.ts` gets a new admin-gated message handler that reuses `maybeAdvance`'s forward transition logic and adds a new backward transition; both bypass the "every player ready" check.
- Client: `games/road-to-survival/client/src/ui/gameHud.tsx` (or `MainScene.ts`) gets a next/previous control visible only to the admin, sending the new message.
