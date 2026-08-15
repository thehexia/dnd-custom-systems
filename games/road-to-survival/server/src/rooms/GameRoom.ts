import { Client, Room } from "@colyseus/core";
import { GameState, PlayerState } from "./schema/GameState.js";

interface MoveMessage {
  x: number;
  y: number;
}

export class GameRoom extends Room<GameState> {
  maxClients = 8;

  onCreate() {
    this.setState(new GameState());

    this.onMessage<MoveMessage>("move", (client, message) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.x = message.x;
      player.y = message.y;
    });
  }

  onJoin(client: Client) {
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    this.state.players.set(client.sessionId, player);
    console.log(`${client.sessionId} joined ${this.roomId}`);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    console.log(`${client.sessionId} left ${this.roomId}`);
  }

  onDispose() {
    console.log(`room ${this.roomId} disposed`);
  }
}
