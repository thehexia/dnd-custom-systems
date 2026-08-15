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
  x: number;
  y: number;
  isAdmin: boolean;
}

/**
 * Connects a plain colyseus.js client (not a browser) to the room as an independent observer
 * and tracks the synced state for the given usernames, keyed by username. Used to assert on the
 * server's authoritative state -- the same state real clients render from -- without depending
 * on Phaser canvas pixel inspection.
 */
export async function observeRoom(code: string): Promise<{
  room: Room;
  snapshots: Map<string, PlayerSnapshot>;
}> {
  const client = new Client(SERVER_URL);
  const room = await client.joinById(code, {
    action: "join",
    code,
    username: `e2e-observer-${Date.now()}`,
  });

  const snapshots = new Map<string, PlayerSnapshot>();
  const $ = getStateCallbacks(room);

  $(room.state).players.onAdd((player) => {
    const sync = () => snapshots.set(player.username, { x: player.x, y: player.y, isAdmin: player.isAdmin });
    sync();
    $(player).onChange(sync);
  });

  return { room, snapshots };
}
