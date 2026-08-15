import { monitor } from "@colyseus/monitor";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Server } from "colyseus";
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { GameRoom } from "./rooms/GameRoom.js";

const port = Number(process.env.SERVER_PORT ?? 2567);

// Changes every process start (including tsx-watch's restart-on-file-change in dev), so clients
// can detect "the server has restarted since I connected" by polling /health and comparing.
const SERVER_STARTED_AT = Date.now();

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  // Unauthenticated, non-sensitive read: safe to allow any origin so the client (a different
  // port in dev) can poll it directly without standing up a proxy.
  res.set("Access-Control-Allow-Origin", "*");
  res.json({ ok: true, startedAt: SERVER_STARTED_AT });
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
