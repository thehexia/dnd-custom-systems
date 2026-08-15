import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateRoom = vi.fn();
const mockJoinRoom = vi.fn();

vi.mock("../net/room", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../net/room")>();
  return {
    ...actual,
    createRoom: mockCreateRoom,
    joinRoom: mockJoinRoom,
  };
});

const { RoomAccessError } = await import("../net/room");
const { showRoomGate } = await import("./roomGate.js");

function submit(form: HTMLFormElement) {
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function createRoomAndGetCreatedSection() {
  mockCreateRoom.mockResolvedValueOnce({ room: {}, code: "ABCDEF", password: "pw123" });
  showRoomGate();
  const createForm = document.querySelector<HTMLFormElement>('[data-form="create"]')!;
  createForm.querySelector<HTMLInputElement>('input[name="username"]')!.value = "alice";
  submit(createForm);
  await flush();
}

beforeEach(() => {
  mockCreateRoom.mockReset();
  mockJoinRoom.mockReset();
  localStorage.clear();
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
  window.history.pushState({}, "", "/");
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  // @ts-expect-error -- jsdom doesn't define execCommand at all by default; only clear it if a test added it.
  delete document.execCommand;
});

describe("create room", () => {
  it("shows the join link, code, and password, and remembers the username", async () => {
    mockCreateRoom.mockResolvedValueOnce({ room: {}, code: "ABCDEF", password: "pw123" });

    showRoomGate();

    const createForm = document.querySelector<HTMLFormElement>('[data-form="create"]')!;
    createForm.querySelector<HTMLInputElement>('input[name="username"]')!.value = "alice";
    submit(createForm);
    await flush();

    const expectedLink = `${window.location.origin}${window.location.pathname}?room=ABCDEF`;
    expect(document.querySelector("[data-created-link]")!.textContent).toBe(expectedLink);
    expect(document.querySelector("[data-created-code]")!.textContent).toBe("ABCDEF");
    expect(document.querySelector("[data-created-password]")!.textContent).toBe("pw123");
    expect(localStorage.getItem("road-to-survival:lastUsername:ABCDEF")).toBe("alice");
  });
});

describe("join room", () => {
  it("pre-fills the remembered username once a full room code is entered", async () => {
    localStorage.setItem("road-to-survival:lastUsername:ABCDEF", "bob");

    showRoomGate();

    document.querySelector<HTMLButtonElement>('[data-tab="join"]')!.click();
    const codeInput = document.querySelector<HTMLInputElement>('[data-form="join"] input[name="code"]')!;
    const usernameInput = document.querySelector<HTMLInputElement>('[data-form="join"] input[name="username"]')!;

    codeInput.value = "abcdef";
    codeInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(usernameInput.value).toBe("bob");
  });

  it("does not pre-fill a username for a room never joined in this browser", async () => {
    showRoomGate();

    document.querySelector<HTMLButtonElement>('[data-tab="join"]')!.click();
    const codeInput = document.querySelector<HTMLInputElement>('[data-form="join"] input[name="code"]')!;
    const usernameInput = document.querySelector<HTMLInputElement>('[data-form="join"] input[name="username"]')!;

    codeInput.value = "zzzzzz";
    codeInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(usernameInput.value).toBe("");
  });

  it("reveals the password field and shows the error when admin password is required", async () => {
    const message = "This is the room creator's username. Enter the room password to reconnect as them.";
    mockJoinRoom.mockRejectedValueOnce(new RoomAccessError("admin-password-required", message));

    showRoomGate();

    document.querySelector<HTMLButtonElement>('[data-tab="join"]')!.click();
    const joinForm = document.querySelector<HTMLFormElement>('[data-form="join"]')!;
    joinForm.querySelector<HTMLInputElement>('input[name="code"]')!.value = "ABCDEF";
    joinForm.querySelector<HTMLInputElement>('input[name="username"]')!.value = "admin";
    submit(joinForm);
    await flush();

    const passwordField = joinForm.querySelector<HTMLElement>("[data-password-field]")!;
    expect(passwordField.hidden).toBe(false);
    expect(document.querySelector('[data-error="join"]')!.textContent).toBe(message);
  });

  it("resolves and remembers the username on a successful join", async () => {
    const fakeRoom = { id: "room-1" };
    mockJoinRoom.mockResolvedValueOnce(fakeRoom);

    const roomPromise = showRoomGate();

    document.querySelector<HTMLButtonElement>('[data-tab="join"]')!.click();
    const joinForm = document.querySelector<HTMLFormElement>('[data-form="join"]')!;
    joinForm.querySelector<HTMLInputElement>('input[name="code"]')!.value = "ABCDEF";
    joinForm.querySelector<HTMLInputElement>('input[name="username"]')!.value = "bob";
    submit(joinForm);
    await flush();

    await expect(roomPromise).resolves.toBe(fakeRoom);
    expect(localStorage.getItem("road-to-survival:lastUsername:ABCDEF")).toBe("bob");
  });
});

describe("create room error", () => {
  it("shows an error message and does not reveal the created section", async () => {
    mockCreateRoom.mockRejectedValueOnce(new RoomAccessError("unknown", "Something broke."));

    showRoomGate();

    const createForm = document.querySelector<HTMLFormElement>('[data-form="create"]')!;
    createForm.querySelector<HTMLInputElement>('input[name="username"]')!.value = "alice";
    submit(createForm);
    await flush();

    expect(document.querySelector('[data-error="create"]')!.textContent).toBe("Something broke.");
    expect(document.querySelector<HTMLElement>("[data-created]")!.hidden).toBe(true);
  });
});

describe("continue after room creation", () => {
  it("resolves with the room and removes the room-gate UI when Continue is clicked", async () => {
    const fakeRoom = { id: "room-1" };
    mockCreateRoom.mockResolvedValueOnce({ room: fakeRoom, code: "ABCDEF", password: "pw123" });

    const roomPromise = showRoomGate();

    const createForm = document.querySelector<HTMLFormElement>('[data-form="create"]')!;
    createForm.querySelector<HTMLInputElement>('input[name="username"]')!.value = "alice";
    submit(createForm);
    await flush();

    document.querySelector<HTMLButtonElement>("[data-continue]")!.click();

    await expect(roomPromise).resolves.toBe(fakeRoom);
    expect(document.getElementById("room-gate")).toBeNull();
  });
});

describe("copy buttons", () => {
  it("copies via the Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    await createRoomAndGetCreatedSection();

    const copyCodeButton = document.querySelector<HTMLButtonElement>('[data-copy="code"]')!;
    copyCodeButton.click();
    await flush();

    expect(writeText).toHaveBeenCalledWith("ABCDEF");
    expect(copyCodeButton.textContent).toBe("Copied!");
    expect(copyCodeButton.disabled).toBe(true);
  });

  it("falls back to execCommand when the Clipboard API is unavailable, and succeeds", async () => {
    // navigator.clipboard is undefined by default in jsdom, so no need to unset it here.
    document.execCommand = vi.fn(() => true);

    await createRoomAndGetCreatedSection();

    const copyLinkButton = document.querySelector<HTMLButtonElement>('[data-copy="link"]')!;
    copyLinkButton.click();
    await flush();

    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(copyLinkButton.textContent).toBe("Copied!");
  });

  it("shows 'Copy failed' when neither the Clipboard API nor execCommand succeed", async () => {
    // Both navigator.clipboard and document.execCommand are unavailable by default in jsdom.
    await createRoomAndGetCreatedSection();

    const copyPasswordButton = document.querySelector<HTMLButtonElement>('[data-copy="password"]')!;
    copyPasswordButton.click();
    await flush();

    expect(copyPasswordButton.textContent).toBe("Copy failed");
  });
});

describe("join via link", () => {
  function navigateToJoinLink(code: string) {
    window.history.pushState({}, "", `/?room=${code}`);
  }

  it("shows the link-join form for the room code in the URL and hides the tabs", () => {
    navigateToJoinLink("abcdef");

    showRoomGate();

    expect(document.querySelector<HTMLElement>("[data-link-join]")!.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>("[data-tabs-mode]")!.hidden).toBe(true);
    expect(document.querySelector("[data-link-code]")!.textContent).toBe("ABCDEF");
  });

  it("pre-fills the remembered username for that room", () => {
    localStorage.setItem("road-to-survival:lastUsername:ABCDEF", "carol");
    navigateToJoinLink("ABCDEF");

    showRoomGate();

    const usernameInput = document.querySelector<HTMLInputElement>(
      '[data-form="link-join"] input[name="username"]',
    )!;
    expect(usernameInput.value).toBe("carol");
  });

  it("resolves and remembers the username on a successful link join", async () => {
    const fakeRoom = { id: "room-1" };
    mockJoinRoom.mockResolvedValueOnce(fakeRoom);
    navigateToJoinLink("ABCDEF");

    const roomPromise = showRoomGate();

    const form = document.querySelector<HTMLFormElement>('[data-form="link-join"]')!;
    form.querySelector<HTMLInputElement>('input[name="username"]')!.value = "dave";
    submit(form);
    await flush();

    expect(mockJoinRoom).toHaveBeenCalledWith("ABCDEF", "dave", undefined);
    await expect(roomPromise).resolves.toBe(fakeRoom);
    expect(localStorage.getItem("road-to-survival:lastUsername:ABCDEF")).toBe("dave");
  });

  it("reveals the password field and shows the error when admin password is required", async () => {
    const message = "This is the room creator's username. Enter the room password to reconnect as them.";
    mockJoinRoom.mockRejectedValueOnce(new RoomAccessError("admin-password-required", message));
    navigateToJoinLink("ABCDEF");

    showRoomGate();

    const form = document.querySelector<HTMLFormElement>('[data-form="link-join"]')!;
    form.querySelector<HTMLInputElement>('input[name="username"]')!.value = "eve";
    submit(form);
    await flush();

    const passwordField = form.querySelector<HTMLElement>("[data-password-field]")!;
    expect(passwordField.hidden).toBe(false);
    expect(document.querySelector('[data-error="link-join"]')!.textContent).toBe(message);
  });
});
