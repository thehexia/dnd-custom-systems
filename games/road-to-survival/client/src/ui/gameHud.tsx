import type { Room } from "colyseus.js";
import { getStateCallbacks } from "colyseus.js";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

type TimelinePhase = "active" | "week-end" | "game-over";

interface PlayerSnapshot {
  sessionId: string;
  username: string;
  isAdmin: boolean;
  ready: boolean;
}

interface TimelineSnapshot {
  week: number;
  phase: TimelinePhase;
}

function snapshotTimeline(room: Room): TimelineSnapshot {
  return { week: room.state.timeline.week, phase: room.state.timeline.phase };
}

function snapshotPlayers(room: Room): PlayerSnapshot[] {
  return [...room.state.players.values()].map((p) => ({
    sessionId: p.sessionId,
    username: p.username,
    isAdmin: p.isAdmin,
    ready: p.ready,
  }));
}

const INITIAL_TIMELINE: TimelineSnapshot = { week: 1, phase: "active" };

function useRoomHudState(room: Room): { players: PlayerSnapshot[]; timeline: TimelineSnapshot } {
  const [players, setPlayers] = useState<PlayerSnapshot[]>([]);
  const [timeline, setTimeline] = useState<TimelineSnapshot>(INITIAL_TIMELINE);

  useEffect(() => {
    // room.state's nested fields (players, timeline) can briefly be undefined right after
    // join/create resolves, before the first full state sync is decoded -- wait for it instead
    // of reading/subscribing immediately, which would throw.
    function whenReady(callback: () => void): void {
      if (room.state.players && room.state.timeline) {
        callback();
      } else {
        room.onStateChange.once(() => whenReady(callback));
      }
    }

    whenReady(() => {
      const $ = getStateCallbacks(room);
      const syncPlayers = () => setPlayers(snapshotPlayers(room));

      syncPlayers();
      setTimeline(snapshotTimeline(room));

      $(room.state).players.onAdd((player) => {
        syncPlayers();
        $(player).onChange(syncPlayers);
      });
      $(room.state).players.onRemove(syncPlayers);
      $(room.state).timeline.onChange(() => setTimeline(snapshotTimeline(room)));
    });
  }, [room]);

  return { players, timeline };
}

export function GameHud({ room }: { room: Room }) {
  const { players, timeline } = useRoomHudState(room);
  const me = players.find((p) => p.sessionId === room.sessionId);

  if (timeline.phase === "game-over") {
    return (
      <div class="game-hud game-hud-over" data-game-over>
        <h2>The party has fallen.</h2>
        <p>Week {timeline.week} was the last.</p>
      </div>
    );
  }

  if (timeline.phase === "week-end") {
    return (
      <div class="game-hud game-hud-week-end" data-week-end>
        <h2>Week {timeline.week} has ended.</h2>
        {me?.isAdmin ? (
          <div class="game-hud-actions">
            <button type="button" data-action="continue" onClick={() => room.send("resolve-week-end", { outcome: "continue" })}>
              Continue to next week
            </button>
            <button type="button" data-action="death" onClick={() => room.send("resolve-week-end", { outcome: "death" })}>
              Party dies
            </button>
          </div>
        ) : (
          <p data-waiting>Waiting for the admin to decide the party's fate...</p>
        )}
      </div>
    );
  }

  return (
    <div class="game-hud game-hud-active" data-active>
      <button type="button" data-action="ready" disabled={me?.ready ?? false} onClick={() => room.send("ready")}>
        {me?.ready ? "Ready!" : "Ready"}
      </button>
      <ul class="game-hud-roster" data-roster>
        {players.map((p) => (
          <li key={p.sessionId} data-ready={p.ready}>
            {p.username}
            {p.ready ? " ✓" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function mountGameHud(room: Room): void {
  const container = document.createElement("div");
  container.id = "game-hud";
  document.body.appendChild(container);
  render(<GameHud room={room} />, container);
}
