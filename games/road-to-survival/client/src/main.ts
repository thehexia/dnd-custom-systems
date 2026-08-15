import Phaser from "phaser";
import { MainScene } from "./scenes/MainScene";
import { mountGameHud } from "./ui/gameHud";
import { showRoomGate } from "./ui/roomGate";

showRoomGate().then((room) => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "app",
    width: 800,
    height: 600,
    backgroundColor: "#2b1f14",
    scene: [],
  });

  game.scene.add("main", MainScene, true, { room });
  mountGameHud(room);
});
