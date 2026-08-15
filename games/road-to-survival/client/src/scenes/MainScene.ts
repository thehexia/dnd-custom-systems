import type { Room } from "colyseus.js";
import { getStateCallbacks } from "colyseus.js";
import Phaser from "phaser";
import { joinGameRoom } from "../net/room";

export class MainScene extends Phaser.Scene {
  private room?: Room;
  private sprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private mySessionId = "";

  constructor() {
    super("main");
  }

  async create() {
    this.room = await joinGameRoom();
    this.mySessionId = this.room.sessionId;

    const $ = getStateCallbacks(this.room);

    $(this.room.state).players.onAdd((player, sessionId) => {
      const color = sessionId === this.mySessionId ? 0x3ddc97 : 0xf25f5c;
      const rect = this.add.rectangle(player.x, player.y, 32, 32, color);
      this.sprites.set(sessionId, rect);

      $(player).onChange(() => {
        rect.setPosition(player.x, player.y);
      });
    });

    $(this.room.state).players.onRemove((_player, sessionId) => {
      this.sprites.get(sessionId)?.destroy();
      this.sprites.delete(sessionId);
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.room?.send("move", { x: pointer.x, y: pointer.y });
    });
  }
}
