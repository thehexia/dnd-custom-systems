import type { Room } from "colyseus.js";
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

export function showRoomGate(): Promise<Room> {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    container.id = "room-gate";
    container.innerHTML = `
      <div class="room-gate-panel">
        <div data-link-join hidden>
          <h3>Join room <span data-link-code></span></h3>
          <form data-form="link-join" class="room-gate-form">
            <label>Username <input name="username" required maxlength="24" autocomplete="off" /></label>
            <label data-password-field hidden>Room Password <input name="password" autocomplete="off" /></label>
            <button type="submit">Join</button>
            <p class="room-gate-error" data-error="link-join"></p>
          </form>
        </div>

        <div data-tabs-mode>
          <div class="room-gate-tabs">
            <button type="button" data-tab="create" class="active">Create Room</button>
            <button type="button" data-tab="join">Join / Rejoin Room</button>
          </div>

          <form data-form="create" class="room-gate-form">
            <label>Username <input name="username" required maxlength="24" autocomplete="off" /></label>
            <button type="submit">Create Room</button>
            <p class="room-gate-error" data-error="create"></p>
          </form>

          <form data-form="join" class="room-gate-form" hidden>
            <label>Room Code <input name="code" required maxlength="6" autocomplete="off" style="text-transform:uppercase" /></label>
            <label>Username <input name="username" required maxlength="24" autocomplete="off" /></label>
            <label data-password-field hidden>Room Password <input name="password" autocomplete="off" /></label>
            <button type="submit">Join / Rejoin</button>
            <p class="room-gate-error" data-error="join"></p>
          </form>
        </div>

        <div class="room-gate-created" data-created hidden>
          <p>Room created! Share the join link (or the code) with friends — no password needed for them. The password below is only needed if you reconnect as the creator, and is shown only once.</p>
          <div class="room-gate-copy-row">
            <span>Join link: <strong data-created-link></strong></span>
            <button type="button" data-copy="link">Copy</button>
          </div>
          <div class="room-gate-copy-row">
            <span>Room code: <strong data-created-code></strong></span>
            <button type="button" data-copy="code">Copy</button>
          </div>
          <div class="room-gate-copy-row">
            <span>Room password: <strong data-created-password></strong></span>
            <button type="button" data-copy="password">Copy</button>
          </div>
          <button type="button" data-continue>Continue</button>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    const copySources: Record<string, string> = {
      link: "[data-created-link]",
      code: "[data-created-code]",
      password: "[data-created-password]",
    };
    container.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => {
      const sourceSelector = copySources[button.dataset.copy!];
      button.addEventListener("click", async () => {
        const text = container.querySelector<HTMLElement>(sourceSelector)!.textContent || "";
        const succeeded = await copyToClipboard(text);
        const originalLabel = button.textContent;
        button.textContent = succeeded ? "Copied!" : "Copy failed";
        button.disabled = true;
        setTimeout(() => {
          button.textContent = originalLabel;
          button.disabled = false;
        }, 1500);
      });
    });

    const linkJoinSection = container.querySelector<HTMLDivElement>("[data-link-join]")!;
    const tabsSection = container.querySelector<HTMLDivElement>("[data-tabs-mode]")!;
    const createdSection = container.querySelector<HTMLDivElement>("[data-created]")!;

    function finish(room: Room) {
      container.remove();
      resolve(room);
    }

    function describeError(err: unknown): string {
      return err instanceof RoomAccessError ? err.message : "Something went wrong. Please try again.";
    }

    function revealPasswordField(form: HTMLFormElement) {
      const field = form.querySelector<HTMLElement>("[data-password-field]")!;
      field.hidden = false;
      form.querySelector<HTMLInputElement>('input[name="password"]')!.focus();
    }

    function showCreated(code: string, password: string) {
      linkJoinSection.hidden = true;
      tabsSection.hidden = true;
      createdSection.hidden = false;
      container.querySelector<HTMLElement>("[data-created-link]")!.textContent = buildJoinLink(code);
      container.querySelector<HTMLElement>("[data-created-code]")!.textContent = code;
      container.querySelector<HTMLElement>("[data-created-password]")!.textContent = password;
    }

    const roomCodeFromLink = new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() || "";

    if (roomCodeFromLink) {
      tabsSection.hidden = true;
      linkJoinSection.hidden = false;
      container.querySelector<HTMLElement>("[data-link-code]")!.textContent = roomCodeFromLink;

      const form = container.querySelector<HTMLFormElement>('[data-form="link-join"]')!;
      const error = container.querySelector<HTMLParagraphElement>('[data-error="link-join"]')!;
      const usernameInput = form.querySelector<HTMLInputElement>('input[name="username"]')!;

      const remembered = getRememberedUsername(roomCodeFromLink);
      if (remembered) usernameInput.value = remembered;

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        error.textContent = "";
        const data = new FormData(form);
        const username = (data.get("username") as string).trim();
        const password = ((data.get("password") as string) || "").trim();

        try {
          const room = await joinRoom(roomCodeFromLink, username, password || undefined);
          setRememberedUsername(roomCodeFromLink, username);
          finish(room);
        } catch (err) {
          if (err instanceof RoomAccessError && err.reason === "admin-password-required") {
            revealPasswordField(form);
          }
          error.textContent = describeError(err);
        }
      });

      return;
    }

    const tabButtons = container.querySelectorAll<HTMLButtonElement>("[data-tab]");
    const forms = {
      create: container.querySelector<HTMLFormElement>('[data-form="create"]')!,
      join: container.querySelector<HTMLFormElement>('[data-form="join"]')!,
    };
    const errors = {
      create: container.querySelector<HTMLParagraphElement>('[data-error="create"]')!,
      join: container.querySelector<HTMLParagraphElement>('[data-error="join"]')!,
    };

    tabButtons.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabButtons.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const which = tab.dataset.tab as "create" | "join";
        forms.create.hidden = which !== "create";
        forms.join.hidden = which !== "join";
      });
    });

    forms.create.addEventListener("submit", async (event) => {
      event.preventDefault();
      errors.create.textContent = "";
      const username = (new FormData(forms.create).get("username") as string).trim();

      try {
        const { room, code, password } = await createRoom(username);
        setRememberedUsername(code, username);
        showCreated(code, password);
        container
          .querySelector<HTMLButtonElement>("[data-continue]")!
          .addEventListener("click", () => finish(room), { once: true });
      } catch (err) {
        errors.create.textContent = describeError(err);
      }
    });

    const joinCodeInput = forms.join.querySelector<HTMLInputElement>('input[name="code"]')!;
    const joinUsernameInput = forms.join.querySelector<HTMLInputElement>('input[name="username"]')!;

    joinCodeInput.addEventListener("input", () => {
      const code = joinCodeInput.value.trim().toUpperCase();
      if (code.length === CODE_LENGTH && !joinUsernameInput.value) {
        const remembered = getRememberedUsername(code);
        if (remembered) joinUsernameInput.value = remembered;
      }
    });

    forms.join.addEventListener("submit", async (event) => {
      event.preventDefault();
      errors.join.textContent = "";
      const data = new FormData(forms.join);
      const code = (data.get("code") as string).trim().toUpperCase();
      const username = (data.get("username") as string).trim();
      const password = ((data.get("password") as string) || "").trim();

      try {
        const room = await joinRoom(code, username, password || undefined);
        setRememberedUsername(code, username);
        finish(room);
      } catch (err) {
        if (err instanceof RoomAccessError && err.reason === "admin-password-required") {
          revealPasswordField(forms.join);
        }
        errors.join.textContent = describeError(err);
      }
    });
  });
}
