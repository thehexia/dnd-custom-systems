import type { Room } from "colyseus.js";
import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { createRoom, joinRoom, RoomAccessError } from "../net/room";

const USERNAME_STORAGE_PREFIX = "road-to-survival:lastUsername:";
const CODE_LENGTH = 6;

function getRememberedUsername(code: string): string | null {
  return localStorage.getItem(USERNAME_STORAGE_PREFIX + code);
}

function setRememberedUsername(code: string, username: string): void {
  localStorage.setItem(USERNAME_STORAGE_PREFIX + code, username);
}

function buildJoinLink(code: string): string {
  return `${window.location.origin}${window.location.pathname}?room=${code}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy fallback below
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let succeeded = false;
  try {
    succeeded = document.execCommand("copy");
  } catch {
    succeeded = false;
  }
  textarea.remove();
  return succeeded;
}

function describeError(err: unknown): string {
  return err instanceof RoomAccessError ? err.message : "Something went wrong. Please try again.";
}

function CopyButton({ copyKey, getText }: { copyKey: string; getText: () => string }) {
  const [label, setLabel] = useState("Copy");
  const [disabled, setDisabled] = useState(false);

  async function handleClick() {
    const succeeded = await copyToClipboard(getText());
    setLabel(succeeded ? "Copied!" : "Copy failed");
    setDisabled(true);
    setTimeout(() => {
      setLabel("Copy");
      setDisabled(false);
    }, 1500);
  }

  return (
    <button type="button" data-copy={copyKey} disabled={disabled} onClick={handleClick}>
      {label}
    </button>
  );
}

function LinkJoinForm({ code, onResolve }: { code: string; onResolve: (room: Room) => void }) {
  const [username, setUsername] = useState(() => getRememberedUsername(code) ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showPassword) passwordInputRef.current?.focus();
  }, [showPassword]);

  async function handleSubmit(event: Event) {
    event.preventDefault();
    setError("");
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    try {
      const room = await joinRoom(code, trimmedUsername, trimmedPassword || undefined);
      setRememberedUsername(code, trimmedUsername);
      onResolve(room);
    } catch (err) {
      if (err instanceof RoomAccessError && err.reason === "admin-password-required") {
        setShowPassword(true);
      }
      setError(describeError(err));
    }
  }

  return (
    <div data-link-join>
      <h3>
        Join room <span data-link-code>{code}</span>
      </h3>
      <form data-form="link-join" class="room-gate-form" onSubmit={handleSubmit}>
        <label>
          Username{" "}
          <input
            name="username"
            required
            maxLength={24}
            autoComplete="off"
            value={username}
            onInput={(event) => setUsername((event.target as HTMLInputElement).value)}
          />
        </label>
        <label data-password-field hidden={!showPassword}>
          Room Password{" "}
          <input
            ref={passwordInputRef}
            name="password"
            autoComplete="off"
            value={password}
            onInput={(event) => setPassword((event.target as HTMLInputElement).value)}
          />
        </label>
        <button type="submit">Join</button>
        <p class="room-gate-error" data-error="link-join">
          {error}
        </p>
      </form>
    </div>
  );
}

function CreateForm({
  hidden,
  onCreated,
}: {
  hidden: boolean;
  onCreated: (room: Room, code: string, password: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: Event) {
    event.preventDefault();
    setError("");
    const trimmedUsername = username.trim();
    const trimmedDaysPerWeek = daysPerWeek.trim();
    const parsedDaysPerWeek = trimmedDaysPerWeek ? Number(trimmedDaysPerWeek) : undefined;

    try {
      const { room, code, password } = await createRoom(trimmedUsername, parsedDaysPerWeek);
      setRememberedUsername(code, trimmedUsername);
      onCreated(room, code, password);
    } catch (err) {
      setError(describeError(err));
    }
  }

  return (
    <form data-form="create" class="room-gate-form" hidden={hidden} onSubmit={handleSubmit}>
      <label>
        Username{" "}
        <input
          name="username"
          required
          maxLength={24}
          autoComplete="off"
          value={username}
          onInput={(event) => setUsername((event.target as HTMLInputElement).value)}
        />
      </label>
      <label>
        Days per week (optional, default 5){" "}
        <input
          name="daysPerWeek"
          type="number"
          min="1"
          step="1"
          autoComplete="off"
          value={daysPerWeek}
          onInput={(event) => setDaysPerWeek((event.target as HTMLInputElement).value)}
        />
      </label>
      <button type="submit">Create Room</button>
      <p class="room-gate-error" data-error="create">
        {error}
      </p>
    </form>
  );
}

function JoinForm({ hidden, onResolve }: { hidden: boolean; onResolve: (room: Room) => void }) {
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showPassword) passwordInputRef.current?.focus();
  }, [showPassword]);

  function handleCodeInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    setCode(value);
    const normalized = value.trim().toUpperCase();
    if (normalized.length === CODE_LENGTH && !username) {
      const remembered = getRememberedUsername(normalized);
      if (remembered) setUsername(remembered);
    }
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    setError("");
    const normalizedCode = code.trim().toUpperCase();
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    try {
      const room = await joinRoom(normalizedCode, trimmedUsername, trimmedPassword || undefined);
      setRememberedUsername(normalizedCode, trimmedUsername);
      onResolve(room);
    } catch (err) {
      if (err instanceof RoomAccessError && err.reason === "admin-password-required") {
        setShowPassword(true);
      }
      setError(describeError(err));
    }
  }

  return (
    <form data-form="join" class="room-gate-form" hidden={hidden} onSubmit={handleSubmit}>
      <label>
        Room Code{" "}
        <input
          name="code"
          required
          maxLength={6}
          autoComplete="off"
          style={{ textTransform: "uppercase" }}
          value={code}
          onInput={handleCodeInput}
        />
      </label>
      <label>
        Username{" "}
        <input
          name="username"
          required
          maxLength={24}
          autoComplete="off"
          value={username}
          onInput={(event) => setUsername((event.target as HTMLInputElement).value)}
        />
      </label>
      <label data-password-field hidden={!showPassword}>
        Room Password{" "}
        <input
          ref={passwordInputRef}
          name="password"
          autoComplete="off"
          value={password}
          onInput={(event) => setPassword((event.target as HTMLInputElement).value)}
        />
      </label>
      <button type="submit">Join / Rejoin</button>
      <p class="room-gate-error" data-error="join">
        {error}
      </p>
    </form>
  );
}

function TabsMode({
  onResolve,
  onCreated,
}: {
  onResolve: (room: Room) => void;
  onCreated: (room: Room, code: string, password: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"create" | "join">("create");

  return (
    <div data-tabs-mode>
      <div class="room-gate-tabs">
        <button
          type="button"
          data-tab="create"
          class={activeTab === "create" ? "active" : ""}
          onClick={() => setActiveTab("create")}
        >
          Create Room
        </button>
        <button
          type="button"
          data-tab="join"
          class={activeTab === "join" ? "active" : ""}
          onClick={() => setActiveTab("join")}
        >
          Join / Rejoin Room
        </button>
      </div>

      <CreateForm hidden={activeTab !== "create"} onCreated={onCreated} />
      <JoinForm hidden={activeTab !== "join"} onResolve={onResolve} />
    </div>
  );
}

function CreatedPanel({
  code,
  password,
  onContinue,
}: {
  code: string;
  password: string;
  onContinue: () => void;
}) {
  const link = buildJoinLink(code);

  return (
    <div class="room-gate-created" data-created>
      <p>
        Room created! Share the join link (or the code) with friends — no password needed for them. The
        password below is only needed if you reconnect as the creator, and is shown only once.
      </p>
      <div class="room-gate-copy-row">
        <span>
          Join link: <strong data-created-link>{link}</strong>
        </span>
        <CopyButton copyKey="link" getText={() => link} />
      </div>
      <div class="room-gate-copy-row">
        <span>
          Room code: <strong data-created-code>{code}</strong>
        </span>
        <CopyButton copyKey="code" getText={() => code} />
      </div>
      <div class="room-gate-copy-row">
        <span>
          Room password: <strong data-created-password>{password}</strong>
        </span>
        <CopyButton copyKey="password" getText={() => password} />
      </div>
      <button type="button" data-continue onClick={onContinue}>
        Continue
      </button>
    </div>
  );
}

function RoomGate({ onResolve }: { onResolve: (room: Room) => void }) {
  const [roomCodeFromLink] = useState(
    () => new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() || "",
  );
  const [created, setCreated] = useState<{ room: Room; code: string; password: string } | null>(null);

  function handleCreated(room: Room, code: string, password: string) {
    setCreated({ room, code, password });
  }

  return (
    <div class="room-gate-panel">
      {created ? (
        <CreatedPanel code={created.code} password={created.password} onContinue={() => onResolve(created.room)} />
      ) : roomCodeFromLink ? (
        <LinkJoinForm code={roomCodeFromLink} onResolve={onResolve} />
      ) : (
        <TabsMode onResolve={onResolve} onCreated={handleCreated} />
      )}
    </div>
  );
}

export function showRoomGate(): Promise<Room> {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    container.id = "room-gate";
    document.body.appendChild(container);

    function handleResolve(room: Room) {
      render(null, container);
      container.remove();
      resolve(room);
    }

    render(<RoomGate onResolve={handleResolve} />, container);
  });
}
