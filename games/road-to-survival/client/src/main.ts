import Phaser from "phaser";
import { MainScene } from "./scenes/MainScene";
import { mountConnectionStatus } from "./ui/connectionStatus";
import { mountCredits } from "./ui/credits";
import { mountGameHud } from "./ui/gameHud";
import { showRoomGate } from "./ui/roomGate";

const connectionStatus = mountConnectionStatus();
mountCredits();

// Phaser's Text game objects render via the Canvas 2D API and need the browser to have already
// parsed these @font-face fonts before any Text object is created -- otherwise canvas text
// renders in a fallback font and never re-renders once the real font finishes loading (see
// design.md - Decisions, "Font-loading order for Phaser Text objects").
const themeFontsReady = Promise.all([document.fonts.load("16px MedievalSharp"), document.fonts.load("16px 'IM Fell English'")]);

Promise.all([showRoomGate(), themeFontsReady]).then(([room]) => {
  connectionStatus.setRoom(room);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "app",
    width: 1100,
    height: 750,
    backgroundColor: "#141110",
    scene: [],
  });

  game.scene.add("main", MainScene, true, { room });
  mountGameHud(room);
});
