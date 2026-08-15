import type { Room } from "colyseus.js";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { watchForServerUpdates } from "../net/version";

type StatusReason = "update-available" | "disconnected";

export function ConnectionStatusBanner({ room }: { room: Room | null }) {
  const [reason, setReason] = useState<StatusReason | null>(null);

  useEffect(() => {
    const stop = watchForServerUpdates({
      onUpdateAvailable: () => setReason((current) => current ?? "update-available"),
    });
    return stop;
  }, []);

  useEffect(() => {
    if (!room) return;
    const handleLeave = () => setReason((current) => current ?? "disconnected");
    room.onLeave(handleLeave);
    return () => room.onLeave.remove(handleLeave);
  }, [room]);

  if (!reason) return null;

  const message =
    reason === "disconnected"
      ? "Lost connection to the game server -- it may have restarted."
      : "A new version of the game is available.";

  return (
    <div class="connection-status-banner" data-connection-status={reason}>
      <span>{message}</span>
      <button type="button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
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
