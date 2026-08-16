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

function PlayerRoster({
  players,
  ready,
  adminOverride,
}: {
  players: PlayerSnapshot[];
  ready?: { disabled: boolean; onClick: () => void };
  adminOverride?: { onPrevious: () => void; onNext: () => void };
}) {
  return (
    <div class="game-roster" data-roster-panel>
      <h3 class="game-roster-heading">Party</h3>
      <ul class="game-roster-list" data-roster>
        {players.map((p) => (
          <li class="game-roster-tab" key={p.sessionId} data-ready={p.ready}>
            <span class="game-roster-avatar" aria-hidden="true">
              {p.username.charAt(0).toUpperCase()}
            </span>
            <span class="game-roster-name">{p.username}</span>
            <span class="game-roster-status">{p.ready ? "Ready" : "Waiting"}</span>
          </li>
        ))}
      </ul>
      {ready ? (
        <button type="button" data-action="ready" disabled={ready.disabled} onClick={ready.onClick}>
          {ready.disabled ? "Ready!" : "Ready"}
        </button>
      ) : null}
      {adminOverride ? (
        <div class="game-roster-override" data-admin-override>
          <button type="button" data-action="override-previous" onClick={adminOverride.onPrevious}>
            ◀ Previous
          </button>
          <button type="button" data-action="override-next" onClick={adminOverride.onNext}>
            Next ▶
          </button>
        </div>
      ) : null}
    </div>
  );
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
    <PlayerRoster
      players={players}
      ready={{ disabled: me?.ready ?? false, onClick: () => room.send("ready") }}
      adminOverride={
        me?.isAdmin
          ? {
              onPrevious: () => room.send("override-segment", { direction: "previous" }),
              onNext: () => room.send("override-segment", { direction: "next" }),
            }
          : undefined
      }
    />
  );
}

export function mountGameHud(room: Room): void {
  const container = document.createElement("div");
  container.id = "game-hud";
  document.body.appendChild(container);
  render(<GameHud room={room} />, container);
}
