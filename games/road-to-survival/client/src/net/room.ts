import { Client, Room } from "colyseus.js";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "ws://localhost:2567";

const client = new Client(SERVER_URL);

export function joinGameRoom(): Promise<Room> {
  return client.joinOrCreate("game");
}
