import type { Page } from "@playwright/test";
import { Client, getStateCallbacks, type Room } from "colyseus.js";

export const SERVER_URL = "ws://localhost:2569";

export async function fillAndSubmit(
  page: Page,
  formSelector: string,
  fields: Record<string, string>,
): Promise<void> {
  const form = page.locator(formSelector);
  for (const [name, value] of Object.entries(fields)) {
    await form.locator(`input[name="${name}"]`).fill(value);
  }
  await form.locator('button[type="submit"]').click();
}

interface PlayerSnapshot {
  isAdmin: boolean;
  ready: boolean;
}

// room.state's nested fields (e.g. `timeline`) can briefly be undefined right after joinById
// resolves, before the first full state sync is decoded -- wait for it so callers can safely
// read `room.state.timeline.*` right away instead of racing it.
function waitForTimeline(room: Room): Promise<void> {
  return new Promise((resolve) => {
    function check() {
      if (room.state.timeline) {
        resolve();
      } else {
        room.onStateChange.once(check);
      }
    }
    check();
  });
}

/**
 * Connects a plain colyseus.js client (not a browser) to the room as an independent observer and
 * tracks the synced state for the given usernames, keyed by username, plus exposes the room so
 * callers can read the shared `state.timeline` (week/segment/phase) directly -- colyseus.js
 * mutates that schema instance in place as patches arrive, so no extra plumbing is needed to keep
 * it live. Used to assert on the server's authoritative state -- the same state real clients
 * render from -- without depending on Phaser canvas pixel inspection.
 */
export async function observeRoom(code: string): Promise<{
  room: Room;
  players: Map<string, PlayerSnapshot>;
}> {
  const client = new Client(SERVER_URL);
  const room = await client.joinById(code, {
    action: "join",
    code,
    username: `e2e-observer-${Date.now()}`,
  });
  await waitForTimeline(room);

  const players = new Map<string, PlayerSnapshot>();
  const $ = getStateCallbacks(room);

  $(room.state).players.onAdd((player) => {
    const sync = () => players.set(player.username, { isAdmin: player.isAdmin, ready: player.ready });
    sync();
    $(player).onChange(sync);
  });

  return { room, players };
}
