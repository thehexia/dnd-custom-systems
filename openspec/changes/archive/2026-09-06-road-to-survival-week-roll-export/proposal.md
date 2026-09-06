## Why

Each week's skill-check cards (the rolled DCs, skills, and player votes on them) currently only exist as live UI state — there is no way for the table to keep a record of what happened during a week once it's over. The admin needs a way to pull the whole week's rolls out at once instead of screenshotting each segment individually.

## What Changes

- Add an admin-only "Export week" action, available from the nav bar, that produces a Markdown document covering every segment of the room's current week.
- The document lists each segment in order with its four skill-check options (skill + DC) and, for each option, which connected players voted for it.
- The export is generated on request (not stored) and only covers the room's actual current week — no picker for past weeks.
- The client triggers a browser download of the generated `.md` file.

## Capabilities

### New Capabilities
- `road-to-survival-week-roll-export`: Admin-triggered generation and download of a Markdown export of the current week's skill-check cards (options, DCs, and votes) for every segment in that week.

### Modified Capabilities
(none — this reads existing card/vote data without changing how cards or votes behave)

## Impact

- `server/src/rooms/GameRoom.ts`: new admin-only message handler that assembles the current week's cards + votes into a Markdown string and returns it to the requesting client.
- `server/src/db/segmentCards.ts`: may need a read helper to fetch all of a week's cards with votes (an equivalent query already exists in `loadOrCreateWeekCards`).
- `client/src/scenes/MainScene.ts` (or nav bar UI): new admin-only "Export week" control that requests the export and saves the returned Markdown as a file download.
