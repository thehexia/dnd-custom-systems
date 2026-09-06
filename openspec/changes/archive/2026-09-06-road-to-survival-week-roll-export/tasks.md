## 1. Markdown Formatting

- [x] 1.1 Add a pure function (e.g. in a new `server/src/rooms/weekExport.ts`) that takes the current week number, days-per-week, and the segment → card (skill/DC/voters) data and returns a Markdown string listing every present segment in order, each with its day/time-of-day (via `describeSegment`), its four options' skill + DC, and each option's voters or an explicit "no votes" indication.
- [x] 1.2 Add unit tests covering: multiple segments in order, an option with multiple voters, an option with no voters, and a week where a later segment hasn't been generated yet (so it's omitted, not blank).

## 2. Server: Admin-Gated Export Message

- [x] 2.1 Add an `onMessage` handler on `GameRoom` (e.g. `"export-week-rolls"`) that looks up the requesting client's player, returns/no-ops silently if `!player?.isAdmin` (matching the existing `resolve-week-end` / override-segment gating), and otherwise builds the Markdown from `this.state.timeline` via the new formatter and sends it back to that client only (e.g. `client.send("export-week-rolls-result", markdown)`).
- [x] 2.2 Add integration tests in `GameRoom.integration.test.ts` covering: admin request returns a document containing every generated segment's options/DCs/voters; a non-admin's request is rejected and no export is sent; a vote cast after one export changes the content of a second export requested afterward.

## 3. Client: Export UI and Download

- [x] 3.1 Add an "Export week" control visible only to the admin (alongside the existing admin-only nav bar controls) that sends the `"export-week-rolls"` message and listens once for `"export-week-rolls-result"`.
- [x] 3.2 On receiving the result, save it as a downloaded `.md` file via a `Blob` + temporary `<a download>` link.
- [x] 3.3 Add/extend a client unit test (e.g. alongside `skillCheckCard.test.ts`) covering that the control only renders for the admin and that receiving a result triggers a file save.

## 4. End-to-End Coverage

- [x] 4.1 Add a Playwright test (e.g. alongside `skill-check-card.spec.ts`) covering that the admin can trigger the export and receive a downloaded `.md` file, and that the control is absent for a non-admin player.
