## Why

The timeline nav bar currently lets any player select and preview any segment of the current week, which spoils upcoming content (encounters, events) for the whole party. Only the admin, who is meant to see what's coming so they can prepare and narrate the game, should be able to look ahead. Everyone else should only ever see the content card for the room's actual current segment.

## What Changes

- Restrict the nav bar's segment-selection interaction (clicking a non-current tile, and the "jump to current day" control) to the room's admin. **BREAKING**: non-admin players lose the ability to preview other segments' content that they previously had.
- For non-admin players, the selected segment always tracks the room's actual current segment; the content card shows only the current segment's content and cannot be pointed elsewhere.
- For the admin, existing look-ahead behavior (select any segment, jump back to current) is unchanged.
- The nav bar's current-vs-selected visual distinction remains admin-only in effect, since non-admins never have a selected segment that differs from the current one.

## Capabilities

### Modified Capabilities
- `road-to-survival-timeline-board`: segment selection via the nav bar (and the jump-to-current-day control) becomes admin-only; non-admin players' selected segment is always the room's actual current segment.

## Impact

- Client: `games/road-to-survival/client/src/scenes/MainScene.ts` (tile pointerdown handler, jump button handler, `selectSegment`) and `games/road-to-survival/client/src/scenes/timeline.ts` (`nextSelectedSegment` behavior for non-admins) need to know the local player's admin status, already available via `room.state.players` / `room.sessionId` (see `client/src/ui/gameHud.tsx` for the existing pattern).
- No server or schema changes: segment selection is purely client-side local UI state and is never sent to the server.
