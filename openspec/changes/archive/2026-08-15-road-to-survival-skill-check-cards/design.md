## Context

See proposal.md - Why. Relevant current state:

- `server/src/rooms/schema/GameState.ts` defines the Colyseus-synced `GameState` (players + `TimelineState`: `daysPerWeek`, `week`, `segment`, `phase`).
- `server/src/rooms/GameRoom.ts` handles week/segment transitions (`ready`, `resolve-week-end`, `override-segment`) and periodically flushes per-player `x`/`y` to Postgres via Prisma (`server/prisma/schema.prisma`: `Room`, `RoomPlayer`).
- Per `specs/road-to-survival-timeline-board`, the Segment Content Area already renders day/time-of-day for the *selected* segment (admin-selectable via nav bar; non-admins always see the room's actual current segment). The nav bar, and therefore this feature, is scoped to the current week only.
- Existing precedent in `GameRoom.ts` (see the comment on `daysPerWeek`) accepts that ephemeral per-room-process state resets if the room's live process fully disposes and is later recreated — except for data explicitly persisted via Prisma (currently just `x`/`y`). This change adds card contents and votes to what's explicitly persisted, per the proposal's decision to make them durable.
- Client theme assets (icons, textures, fonts) live under `client/public/theme/`, e.g. `theme/icons/sun.svg`, `theme/icons/moon.svg`.

## Goals / Non-Goals

**Goals:**
- Generate a stable, persisted 4-option skill-check card for every segment of a week, at the moment that week is generated.
- Enforce the DC tiering rule (one unconstrained 5–20, one 10–15, two independently-rolled 15–20) and 4-distinct-skills rule server-side.
- Render each option with a skill icon and its DC, and let each connected player cast one vote per card, visible to everyone in real time via a label next to the voted option's icon.
- Make both card contents and votes durable across reconnects and full room-process recreation.

**Non-Goals:**
- Resolving the skill check itself (rolling against the DC to determine success/failure) or any downstream narrative/consequence system. Left for a future change.
- Flavor text, imagery, or narrative framing for a card beyond its 4 skill/DC options — out of scope here.
- Any UI for browsing cards from a past week; the existing nav bar already scopes segment selection to the current week, and this change doesn't extend that.
- Homebrew or configurable skill lists — uses the standard D&D 5e 18-skill list (Acrobatics, Animal Handling, Arcana, Athletics, Deception, History, Insight, Intimidation, Investigation, Medicine, Nature, Perception, Performance, Persuasion, Religion, Sleight of Hand, Stealth, Survival).

## Decisions

**Card generation is server-authoritative and idempotent per (room, week, segment).** A pure function samples 4 distinct skills from the 18-skill pool, rolls a DC per the tiering rule for each (uniform-random integer within the option's tier range), and shuffles the 4 options into display order so DC magnitude doesn't correlate with position. Generation runs once, in `GameRoom`: at `onCreate` for a newly-created room's Week 1, and inside the existing `resolve-week-end` "continue" branch for the new week, immediately followed by a Prisma write of one `RoomSegmentCard` row per segment. A unique DB constraint on `(roomId, week, segment)` makes generation idempotent — if rows already exist (e.g. a retried call), generation is skipped rather than overwriting them, which is what keeps a card stable across revisits.

**Card contents and votes persist via two new Prisma models, not just Colyseus room state.** Room state alone doesn't survive a full room-process dispose/recreate, which is one of the two stability guarantees this change makes (the other being segment-navigation stability within a live session, which room state alone already provides). Alternative considered: keep cards in-memory only and accept the existing "resets on full dispose" precedent used by `daysPerWeek` — rejected per explicit product decision that card/vote stability must survive a server restart, not just a live session.

  ```prisma
  model RoomSegmentCard {
    id        String            @id @default(uuid())
    roomId    String
    room      Room              @relation(fields: [roomId], references: [id])
    week      Int
    segment   Int
    options   Json              // ordered array of 4: [{ skill: string, dc: number }]
    createdAt DateTime          @default(now())
    votes     RoomSegmentVote[]

    @@unique([roomId, week, segment])
  }

  model RoomSegmentVote {
    id           String          @id @default(uuid())
    cardId       String
    card         RoomSegmentCard @relation(fields: [cardId], references: [id])
    roomPlayerId String
    roomPlayer   RoomPlayer      @relation(fields: [roomPlayerId], references: [id])
    optionIndex  Int
    updatedAt    DateTime        @updatedAt

    @@unique([cardId, roomPlayerId])
  }
  ```

  A vote is written with an upsert keyed on `(cardId, roomPlayerId)`, so "casting a new vote replaces the old one" is a single DB operation. Votes are identified by `roomPlayerId` (the durable per-username identity already used for `x`/`y`), not `sessionId`, so a vote survives a reconnect that gets a new session.

**Votes are written immediately, not batched on the existing 5s flush interval.** The existing flush interval is an acceptable-loss trade-off for continuous position data; a vote is a discrete, infrequent, human-paced action where losing it to a crash before the next flush is more noticeable and easy to avoid by writing synchronously in the message handler.

**Room-state schema mirrors only the current week's cards/votes**, matching the nav bar's existing current-week-only scope. `GameState.timeline` gains a `MapSchema<SegmentCardState>` keyed by segment number; each `SegmentCardState` holds 4 `SegmentCardOptionState` entries (`skill`, `dc`, `voters: ArraySchema<string>` of usernames). On room creation and on entering a new week, the server populates this map from the just-written (or, on process recreation, just-loaded) `RoomSegmentCard`/`RoomSegmentVote` rows for that week.

**Room-process recreation loads rather than regenerates.** When `onCreate` runs for the "join" path on a room whose DB record already exists (i.e., the live process was recreated), the server loads that room's current-week `RoomSegmentCard` rows (plus their votes) from Postgres into the schema map instead of generating new ones. If a card row is unexpectedly missing for a segment of the current week (e.g. a prior crash between week-increment and card-write), generation runs for just that gap as a self-healing safety net — the idempotent unique constraint makes this safe to attempt unconditionally.

**Voting always targets the room's actual current segment; the client never sends a segment identifier.** The `vote-skill-check` message carries only an option index. The server applies it to `this.state.timeline.segment`, which is what makes "vote rejected for a non-current segment" structurally true rather than a check that can be bypassed — there's no field to spoof. This mirrors how `ready` already works.

**Icons come from an openly-licensed SVG icon set (game-icons.net, CC BY 3.0), stored locally.** One SVG per skill under `client/public/theme/icons/skills/<skill-slug>.svg`, following the existing `theme/icons/sun.svg` / `moon.svg` convention, plus an attribution file recording the license and per-icon authors as CC BY requires. Selecting local, license-compatible assets avoids a runtime dependency on a third-party icon CDN (which the client currently has none of) and matches how `sun.svg`/`moon.svg` are already vendored rather than linked.

## Risks / Trade-offs

- [Two DB round-trips per week generation (write cards, then read them back into schema state)] → Acceptable: week generation happens at most a few times per room lifetime (once at creation, once per week-end "continue"), not a hot path.
- [Synchronous per-vote DB write adds latency to the vote round-trip compared to the debounced position flush] → Acceptable given expected room sizes (≤8 players per `GameRoom.maxClients`) and human-paced voting frequency; simpler and safer than reconciling a batched write with the idempotent-card self-healing path.
- [CC BY attribution requirement for sourced icons] → Mitigated by checking in a single attribution file alongside the icon assets, following the license's requirements once rather than per-use.
- [Self-healing generation on process recreation could, in a race between two rapidly-recreated processes, attempt concurrent inserts for the same `(roomId, week, segment)`] → Mitigated by the DB-level unique constraint: the losing insert fails or is skipped (`skipDuplicates`), and that process re-reads the now-present row instead.

## Migration Plan

- Add a new Prisma migration introducing `RoomSegmentCard` and `RoomSegmentVote` (plus the `RoomPlayer.votes` back-relation). Purely additive — no existing tables or columns change, no backfill needed since this is new functionality with no prior data.
- Rollback: revert the migration (drop the two new tables); no other capability depends on them yet.
