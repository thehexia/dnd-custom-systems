## Context

`GameRoom.state.timeline.cards` (a `MapSchema<SegmentCardState>` keyed by segment number, see [GameState.ts](games/road-to-survival/server/src/rooms/schema/GameState.ts)) already holds every generated segment's card for the room's actual current week — each option's `skill`, `dc`, and `voters` (usernames). It's populated by `ensureWeekCards` on room creation and on "continue to next week", and kept live as votes come in. Admin status is tracked per connected player as `PlayerState.isAdmin` / `RoomPlayer.isAdmin`, and existing admin-only message handlers (e.g. `resolve-week-end`) already gate on `player?.isAdmin` before doing anything. See proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- Reuse the room's existing live state and existing admin-check pattern rather than introducing a new auth path.
- Keep the export a pure read: no new persisted rows, no change to card/vote behavior.

**Non-Goals:**
- Exporting a week other than the room's actual current week (see proposal.md).
- Persisting or caching generated exports.
- Any format other than Markdown.

## Decisions

**Deliver the export over the existing Colyseus connection, not a new REST route.** The admin is already a connected, authenticated client with `player.isAdmin` known server-side. A new Express route would need its own way to prove "this requester is this room's admin" (room code + password again, or a new token), duplicating auth that already exists on the live connection. Reusing the connection means the export handler is just another `onMessage` case, gated the same way `resolve-week-end` and the segment override already are.

**Build the Markdown from `state.timeline.cards`, not a fresh DB query.** That state is already scoped to exactly "the room's actual current week" (see [GameState.ts](games/road-to-survival/server/src/rooms/schema/GameState.ts)'s "Room-state schema mirrors only the current week's cards/votes" comment) and is already kept live-consistent with votes, so reading it directly satisfies "Export Reflects Live Data at Request Time" for free and avoids a second source of truth for the same data during the request. `loadOrCreateWeekCards` (used to populate this state) remains the only DB read path; the export handler does not call Prisma directly.

**Segment labeling uses the existing `describeSegment` helper.** [timeline.ts](games/road-to-survival/server/src/rooms/timeline.ts)'s `describeSegment(segment)` already maps a segment number to `{ day, timeOfDay }`; the export reuses it verbatim so segment labels in the document match what the nav bar already shows for the same segment.

**Response is a one-shot message reply, not a schema field.** The export is requested on demand and isn't part of ongoing room state that other clients need to observe, so it's returned via a direct reply to the requesting client's message (e.g. `client.send("export-week-rolls-result", markdown)`) rather than added to `GameState`. Alternatives considered: broadcasting the result to all clients (rejected — only the requesting admin asked for it, and only the admin's client should trigger a download); adding an `exportedMarkdown` field to `GameState` (rejected — turns a one-off request/response into synced state every client would receive on every change).

**Markdown generation is a pure function taking `TimelineState`-shaped data.** Mirrors how `generateCard`/`rollDcTiers` in [cardGeneration.ts](games/road-to-survival/server/src/rooms/cardGeneration.ts) are kept separate from the room's message-handling code, so the formatting logic can be unit-tested without spinning up a Colyseus room.

**Client triggers the download via a `Blob` + temporary `<a download>` link**, the standard browser pattern for saving in-memory text as a file, matching how the rest of the client already avoids adding new runtime dependencies for one-off UI actions.

## Risks / Trade-offs

- [Very long weeks (many segments) could produce a large single message payload] → Weeks are bounded by `daysPerWeek` set at room creation (small, human-configured numbers), so payload size stays trivial; no pagination needed.
- [Reading from live `state.timeline.cards` means a segment that failed to generate (missing from the map) is silently skipped rather than erroring] → Matches the spec's "a segment that has not yet been generated SHALL NOT be included" requirement, so this is intended behavior, not a gap.
