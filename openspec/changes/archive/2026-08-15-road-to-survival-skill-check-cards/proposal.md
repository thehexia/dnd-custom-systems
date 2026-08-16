## Why

Right now the segment content area only shows a segment's day number and time-of-day — there is no actual content for players to engage with during a segment. This change fills that area with a "Road to Survival" content card offering a skill-check decision: four randomly rolled skill checks with visible DCs, which players vote on together.

## What Changes

- Add a content card to each segment's content area, presenting exactly 4 skill-check options.
- Each option is a randomly selected D&D 5e skill (no duplicate skills within a card) paired with a visible DC:
  - One option: DC uniformly random in [5, 20], unconstrained by any tier.
  - One option: DC uniformly random in [10, 15].
  - Two options: DC uniformly random in [15, 20] each.
- Each option displays an icon representing its skill, sourced from an openly-licensed icon set and stored alongside the game's existing theme assets (`client/public/theme/icons/`).
- A connected player can vote for one of the four options on the currently-active segment's card. Voting again on a different option moves their vote; voting is one option at a time per player.
- Votes are visible to every connected player in real time: the option a player has voted for shows a label identifying that player next to its icon.
- Card contents (the 4 selected skills and their DCs) are generated once, when a week is generated (room creation for Week 1, and each "continue to next week" week-end resolution), for every segment of that week. Card contents are persisted to Postgres so they remain stable across room revisits and server restarts, not just for the room's live session.
- Resolving the skill check (rolling against the DC to determine success/failure) is explicitly out of scope for this change — see Non-Goals in design.md.

## Capabilities

### New Capabilities
- `road-to-survival-skill-check-cards`: Generation, persistence, and display of each segment's skill-check content card, its 4 randomly-rolled options with tiered DCs and skill icons, and the player voting mechanic on those options.

### Modified Capabilities
- `road-to-survival-timeline-board`: The Segment Content Area requirement's "displays at minimum the day number and time-of-day" behavior is extended — the content area now also renders the selected segment's skill-check content card (see the new `road-to-survival-skill-check-cards` capability for the card's own requirements).

## Impact

- **Server** (`games/road-to-survival/server`): card generation logic (skill pool, DC rolls), a Postgres-backed model for per-segment card contents (Prisma schema + migration), vote state added to room schema, `GameRoom` message handling for casting a vote, generation triggered at room creation and at week-end "continue" resolution.
- **Client** (`games/road-to-survival/client`): content card UI component in the segment content area, skill icon assets, vote interaction and voted-label rendering wired to shared room state.
- **Assets**: new skill icon set added under `client/public/theme/icons/`.
- **Database**: new Prisma migration for persisted card/vote data; integration tests against Postgres per project rules.
