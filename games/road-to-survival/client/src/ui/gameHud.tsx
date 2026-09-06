import type { Room } from "colyseus.js";
import { getStateCallbacks } from "colyseus.js";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

type TimelinePhase = "active" | "week-end" | "game-over";
type RoomMode = "normal" | "hunted";

interface PlayerSnapshot {
  sessionId: string;
  username: string;
  isAdmin: boolean;
  ready: boolean;
  skipVote: boolean;
  leadTokens: number;
}

interface TimelineSnapshot {
  week: number;
  phase: TimelinePhase;
  mode: RoomMode;
  skipConfirmationAvailable: boolean;
  leadTokenAssignmentAvailable: boolean;
  currentSegmentHasActiveVote: boolean;
}

function snapshotTimeline(room: Room): TimelineSnapshot {
  return {
    week: room.state.timeline.week,
    phase: room.state.timeline.phase,
    mode: room.state.timeline.mode,
    skipConfirmationAvailable: room.state.timeline.skipConfirmationAvailable,
    leadTokenAssignmentAvailable: room.state.timeline.leadTokenAssignmentAvailable,
    currentSegmentHasActiveVote: room.state.timeline.currentSegmentHasActiveVote,
  };
}

function snapshotPlayers(room: Room): PlayerSnapshot[] {
  return [...room.state.players.values()].map((p) => ({
    sessionId: p.sessionId,
    username: p.username,
    isAdmin: p.isAdmin,
    ready: p.ready,
    skipVote: p.skipVote,
    leadTokens: p.leadTokens,
  }));
}

const INITIAL_TIMELINE: TimelineSnapshot = {
  week: 1,
  phase: "active",
  mode: "normal",
  skipConfirmationAvailable: false,
  leadTokenAssignmentAvailable: false,
  currentSegmentHasActiveVote: false,
};

// Explains why the Forced March button is disabled, or returns null when it's fully available
// (see specs/road-to-survival-hunted-mode - Forced March Vote, and Forced March Vote Locked
// While a Skill-Check Vote Is Active). Checked in order: the admin never votes for a Forced
// March at all; a skill-check vote already active on the current segment locks the option out
// for everyone; finally, the player's own vote already being cast needs no extra explanation
// beyond the existing "Marching!" label.
function forcedMarchDisabledReason(me: PlayerSnapshot | undefined, timeline: TimelineSnapshot): string | null {
  if (me?.isAdmin) return "The admin doesn't vote on the Forced March.";
  if (timeline.currentSegmentHasActiveVote) return "Someone has already voted to roll a check this segment.";
  if (me?.skipVote) return "You're already marching.";
  return null;
}

function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function useWeekExport(room: Room): () => void {
  useEffect(() => {
    room.onMessage<string>("export-week-rolls-result", (markdown) => {
      downloadMarkdown(`week-${room.state.timeline.week}-rolls.md`, markdown);
    });
  }, [room]);

  return () => room.send("export-week-rolls");
}

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

// Admin-only control for switching a room between Normal and Hunted Mode (see
// specs/road-to-survival-hunted-mode - Admin Toggles Room Mode). The server accepts this at any
// timeline phase, so every phase-specific view below renders it for the admin.
function ModeToggle({ mode, onClick }: { mode: RoomMode; onClick: () => void }) {
  return (
    <button type="button" data-action="toggle-mode" onClick={onClick}>
      {mode === "hunted" ? "Disable Hunted Mode" : "Enable Hunted Mode"}
    </button>
  );
}

function PlayerRoster({
  players,
  ready,
  adminOverride,
  onExportWeek,
  modeToggle,
  forcedMarchVote,
  confirmForcedMarch,
  assignLeadTokens,
}: {
  players: PlayerSnapshot[];
  ready?: { disabled: boolean; onClick: () => void };
  adminOverride?: { onPrevious: () => void; onNext: () => void };
  onExportWeek?: () => void;
  modeToggle?: { mode: RoomMode; onClick: () => void };
  forcedMarchVote?: { disabled: boolean; reason: string | null; count: number; total: number; onClick: () => void };
  confirmForcedMarch?: { disabled: boolean; onClick: () => void };
  assignLeadTokens?: { disabled: boolean; onClick: () => void };
}) {
  return (
    <div class="game-roster" data-roster-panel>
      <h3 class="game-roster-heading">Party</h3>
      <ul class="game-roster-list" data-roster>
        {players.map((p) => (
          <li class="game-roster-tab" key={p.sessionId} data-ready={p.ready} data-lead-tokens={p.leadTokens}>
            <span class="game-roster-avatar" aria-hidden="true">
              {p.username.charAt(0).toUpperCase()}
            </span>
            <span class="game-roster-name">{p.username}</span>
            {p.leadTokens > 0 ? (
              <span
                class="game-roster-token"
                data-lead-token-badge
                title={`Holds ${p.leadTokens} Lead token${p.leadTokens === 1 ? "" : "s"}`}
                aria-label={`Holds ${p.leadTokens} Lead token${p.leadTokens === 1 ? "" : "s"}`}
              >
                🔑 ×{p.leadTokens}
              </span>
            ) : null}
            <span class="game-roster-status">{p.ready ? "Ready" : "Waiting"}</span>
          </li>
        ))}
      </ul>
      {ready ? (
        <button type="button" data-action="ready" disabled={ready.disabled} onClick={ready.onClick}>
          {ready.disabled ? "Ready!" : "Ready"}
        </button>
      ) : null}
      {forcedMarchVote ? (
        <>
          <button
            type="button"
            data-action="vote-skip"
            disabled={forcedMarchVote.disabled}
            onClick={forcedMarchVote.onClick}
          >
            {forcedMarchVote.disabled ? "Marching!" : "Forced March"} ({forcedMarchVote.count}/{forcedMarchVote.total})
          </button>
          {forcedMarchVote.reason ? <p class="game-roster-hint" data-forced-march-reason>{forcedMarchVote.reason}</p> : null}
        </>
      ) : null}
      {confirmForcedMarch ? (
        <button
          type="button"
          data-action="confirm-skip"
          disabled={confirmForcedMarch.disabled}
          onClick={confirmForcedMarch.onClick}
        >
          Confirm Forced March
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
      {assignLeadTokens ? (
        <button
          type="button"
          data-action="assign-lead-tokens"
          disabled={assignLeadTokens.disabled}
          onClick={assignLeadTokens.onClick}
        >
          Assign Lead Tokens
        </button>
      ) : null}
      {modeToggle ? <ModeToggle mode={modeToggle.mode} onClick={modeToggle.onClick} /> : null}
      {onExportWeek ? (
        <button type="button" data-action="export-week-rolls" onClick={onExportWeek}>
          Export week
        </button>
      ) : null}
    </div>
  );
}

export function GameHud({ room }: { room: Room }) {
  const { players, timeline } = useRoomHudState(room);
  const me = players.find((p) => p.sessionId === room.sessionId);
  const exportWeek = useWeekExport(room);

  // The admin can switch modes at any timeline phase (see specs/road-to-survival-hunted-mode -
  // Admin Toggles Room Mode), so this is threaded into every phase-specific view below.
  const modeToggle = me?.isAdmin
    ? {
        mode: timeline.mode,
        onClick: () => room.send("set-mode", { mode: timeline.mode === "hunted" ? "normal" : "hunted" }),
      }
    : undefined;

  if (timeline.phase === "game-over") {
    return (
      <div class="game-hud game-hud-over" data-game-over>
        <h2>The party has fallen.</h2>
        <p>Week {timeline.week} was the last.</p>
        {modeToggle ? <ModeToggle mode={modeToggle.mode} onClick={modeToggle.onClick} /> : null}
      </div>
    );
  }

  if (timeline.phase === "week-end") {
    return (
      <div class="game-hud game-hud-week-end" data-week-end>
        <h2>Week {timeline.week} has ended.</h2>
        {me?.isAdmin ? (
          <div class="game-hud-actions">
            <button type="button" data-action="export-week-rolls" onClick={exportWeek}>
              Export week
            </button>
            <button type="button" data-action="continue" onClick={() => room.send("resolve-week-end", { outcome: "continue" })}>
              Continue to next week
            </button>
            <button type="button" data-action="death" onClick={() => room.send("resolve-week-end", { outcome: "death" })}>
              Party dies
            </button>
            {timeline.mode === "hunted" ? (
              <button
                type="button"
                data-action="assign-lead-tokens"
                disabled={!timeline.leadTokenAssignmentAvailable}
                onClick={() => room.send("assign-lead-tokens")}
              >
                Assign Lead Tokens
              </button>
            ) : null}
            {modeToggle ? <ModeToggle mode={modeToggle.mode} onClick={modeToggle.onClick} /> : null}
          </div>
        ) : (
          <p data-waiting>Waiting for the admin to decide the party's fate...</p>
        )}
      </div>
    );
  }

  const hunted = timeline.mode === "hunted";
  // The admin never casts a Forced March vote (see specs/road-to-survival-hunted-mode - Forced
  // March Vote), so the displayed tally matches the server's admin-excluded majority calculation.
  const nonAdminPlayers = players.filter((p) => !p.isAdmin);
  const skipCount = nonAdminPlayers.filter((p) => p.skipVote).length;
  const forcedMarchReason = forcedMarchDisabledReason(me, timeline);
  // Skip the hint when the only reason is the player's own vote already being cast -- the
  // "Marching!" label already says that.
  const forcedMarchHint = me?.isAdmin || timeline.currentSegmentHasActiveVote ? forcedMarchReason : null;

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
      onExportWeek={me?.isAdmin ? exportWeek : undefined}
      modeToggle={modeToggle}
      forcedMarchVote={
        hunted
          ? {
              disabled: forcedMarchReason !== null,
              reason: forcedMarchHint,
              count: skipCount,
              total: nonAdminPlayers.length,
              onClick: () => room.send("vote-skip"),
            }
          : undefined
      }
      confirmForcedMarch={
        me?.isAdmin && hunted
          ? { disabled: !timeline.skipConfirmationAvailable, onClick: () => room.send("confirm-skip") }
          : undefined
      }
      assignLeadTokens={
        me?.isAdmin && hunted
          ? { disabled: !timeline.leadTokenAssignmentAvailable, onClick: () => room.send("assign-lead-tokens") }
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
