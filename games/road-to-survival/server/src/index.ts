import { monitor } from "@colyseus/monitor";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Server } from "colyseus";
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { GameRoom } from "./rooms/GameRoom.js";

const port = Number(process.env.SERVER_PORT ?? 2567);

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/monitor", monitor());

const httpServer = createServer(app);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define("game", GameRoom);

httpServer.listen(port, () => {
  console.log(`Colyseus server listening on ws://localhost:${port}`);
  console.log(`Monitor available at http://localhost:${port}/monitor`);
});
