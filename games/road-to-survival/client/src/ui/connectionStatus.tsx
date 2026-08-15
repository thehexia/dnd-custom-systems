import type { Room } from "colyseus.js";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { watchForServerUpdates } from "../net/version";

type StatusReason = "update-available" | "disconnected";

function formatStartedAt(startedAt: number): string {
  return new Date(startedAt).toLocaleTimeString();
}

export function ConnectionStatusBanner({ room }: { room: Room | null }) {
  const [reason, setReason] = useState<StatusReason | null>(null);
  const [serverStartedAt, setServerStartedAt] = useState<number | null>(null);

  useEffect(() => {
    const stop = watchForServerUpdates({
      onUpdateAvailable: () => setReason((current) => current ?? "update-available"),
      onStatusChange: setServerStartedAt,
    });
    return stop;
  }, []);

  useEffect(() => {
    if (!room) return;
    const handleLeave = () => setReason((current) => current ?? "disconnected");
    room.onLeave(handleLeave);
    return () => room.onLeave.remove(handleLeave);
  }, [room]);

  const message =
    reason === "disconnected"
      ? "Lost connection to the game server -- it may have restarted."
      : "A new version of the game is available.";

  return (
    <>
      {serverStartedAt !== null && (
        <div class="server-status-badge" data-server-status>
          Server started {formatStartedAt(serverStartedAt)}
        </div>
      )}
      {reason && (
        <div class="connection-status-banner" data-connection-status={reason}>
          <span>{message}</span>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}
    </>
  );
}

export function mountConnectionStatus(): { setRoom: (room: Room) => void } {
  const container = document.createElement("div");
  container.id = "connection-status";
  document.body.appendChild(container);

  function renderWithRoom(room: Room | null) {
    render(<ConnectionStatusBanner room={room} />, container);
  }

  renderWithRoom(null);

  return {
    setRoom: (room: Room) => renderWithRoom(room),
  };
}
