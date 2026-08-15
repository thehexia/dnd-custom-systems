import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/preact";

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

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function getForm(name: "create" | "join" | "link-join"): HTMLFormElement {
  return document.querySelector<HTMLFormElement>(`[data-form="${name}"]`)!;
}

async function createRoomAndGetCreatedPanel() {
  mockCreateRoom.mockResolvedValueOnce({ room: {}, code: "ABCDEF", password: "pw123" });
  showRoomGate();
  const form = getForm("create");
  fireEvent.input(within(form).getByLabelText("Username"), { target: { value: "alice" } });
  fireEvent.submit(form);
  await flush();
}

beforeEach(() => {
  mockCreateRoom.mockReset();
  mockJoinRoom.mockReset();
  localStorage.clear();
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
    await createRoomAndGetCreatedPanel();

    const expectedLink = `${window.location.origin}${window.location.pathname}?room=ABCDEF`;
    expect(screen.getByText(expectedLink)).toBeTruthy();
    expect(screen.getByText("ABCDEF")).toBeTruthy();
    expect(screen.getByText("pw123")).toBeTruthy();
    expect(localStorage.getItem("road-to-survival:lastUsername:ABCDEF")).toBe("alice");
  });

  it("omits daysPerWeek when the field is left blank", async () => {
    mockCreateRoom.mockResolvedValueOnce({ room: {}, code: "ABCDEF", password: "pw123" });
    showRoomGate();
    const form = getForm("create");
    fireEvent.input(within(form).getByLabelText("Username"), { target: { value: "alice" } });
    fireEvent.submit(form);
    await flush();

    expect(mockCreateRoom).toHaveBeenCalledWith("alice", undefined);
  });

  it("passes a parsed days-per-week value when provided", async () => {
    mockCreateRoom.mockResolvedValueOnce({ room: {}, code: "ABCDEF", password: "pw123" });
    showRoomGate();
    const form = getForm("create");
    fireEvent.input(within(form).getByLabelText("Username"), { target: { value: "alice" } });
    fireEvent.input(within(form).getByLabelText("Days per week (optional, default 5)"), { target: { value: "3" } });
    fireEvent.submit(form);
    await flush();

    expect(mockCreateRoom).toHaveBeenCalledWith("alice", 3);
  });
});

describe("join room", () => {
  it("pre-fills the remembered username once a full room code is entered", async () => {
    localStorage.setItem("road-to-survival:lastUsername:ABCDEF", "bob");

    showRoomGate();

    fireEvent.click(screen.getByRole("button", { name: "Join / Rejoin Room" }));
    const form = getForm("join");
    const usernameInput = within(form).getByLabelText("Username") as HTMLInputElement;

    fireEvent.input(within(form).getByLabelText("Room Code"), { target: { value: "abcdef" } });

    expect(usernameInput.value).toBe("bob");
  });

  it("does not pre-fill a username for a room never joined in this browser", async () => {
    showRoomGate();

    fireEvent.click(screen.getByRole("button", { name: "Join / Rejoin Room" }));
    const form = getForm("join");
    const usernameInput = within(form).getByLabelText("Username") as HTMLInputElement;

    fireEvent.input(within(form).getByLabelText("Room Code"), { target: { value: "zzzzzz" } });

    expect(usernameInput.value).toBe("");
  });

  it("reveals the password field and shows the error when admin password is required", async () => {
    const message = "This is the room creator's username. Enter the room password to reconnect as them.";
    mockJoinRoom.mockRejectedValueOnce(new RoomAccessError("admin-password-required", message));

    showRoomGate();

    fireEvent.click(screen.getByRole("button", { name: "Join / Rejoin Room" }));
    const form = getForm("join");
    fireEvent.input(within(form).getByLabelText("Room Code"), { target: { value: "ABCDEF" } });
    fireEvent.input(within(form).getByLabelText("Username"), { target: { value: "admin" } });
    fireEvent.submit(form);
    await flush();

    expect(form.querySelector<HTMLElement>("[data-password-field]")!.hidden).toBe(false);
    expect(screen.getByText(message)).toBeTruthy();
  });

  it("resolves and remembers the username on a successful join", async () => {
    const fakeRoom = { id: "room-1" };
    mockJoinRoom.mockResolvedValueOnce(fakeRoom);

    const roomPromise = showRoomGate();

    fireEvent.click(screen.getByRole("button", { name: "Join / Rejoin Room" }));
    const form = getForm("join");
    fireEvent.input(within(form).getByLabelText("Room Code"), { target: { value: "ABCDEF" } });
    fireEvent.input(within(form).getByLabelText("Username"), { target: { value: "bob" } });
    fireEvent.submit(form);
    await flush();

    await expect(roomPromise).resolves.toBe(fakeRoom);
    expect(localStorage.getItem("road-to-survival:lastUsername:ABCDEF")).toBe("bob");
  });
});

describe("create room error", () => {
  it("shows an error message and does not reveal the created section", async () => {
    mockCreateRoom.mockRejectedValueOnce(new RoomAccessError("unknown", "Something broke."));

    showRoomGate();

    const form = getForm("create");
    fireEvent.input(within(form).getByLabelText("Username"), { target: { value: "alice" } });
    fireEvent.submit(form);
    await flush();

    expect(screen.getByText("Something broke.")).toBeTruthy();
    expect(document.querySelector("[data-created]")).toBeNull();
  });
});

describe("continue after room creation", () => {
  it("resolves with the room and removes the room-gate UI when Continue is clicked", async () => {
    const fakeRoom = { id: "room-1" };
    mockCreateRoom.mockResolvedValueOnce({ room: fakeRoom, code: "ABCDEF", password: "pw123" });

    const roomPromise = showRoomGate();

    const form = getForm("create");
    fireEvent.input(within(form).getByLabelText("Username"), { target: { value: "alice" } });
    fireEvent.submit(form);
    await flush();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await expect(roomPromise).resolves.toBe(fakeRoom);
    expect(document.getElementById("room-gate")).toBeNull();
  });
});

describe("copy buttons", () => {
  it("copies via the Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    await createRoomAndGetCreatedPanel();

    const copyCodeButton = document.querySelector<HTMLButtonElement>('[data-copy="code"]')!;
    fireEvent.click(copyCodeButton);
    await flush();

    expect(writeText).toHaveBeenCalledWith("ABCDEF");
    expect(copyCodeButton.textContent).toBe("Copied!");
    expect(copyCodeButton.disabled).toBe(true);
  });

  it("falls back to execCommand when the Clipboard API is unavailable, and succeeds", async () => {
    // navigator.clipboard is undefined by default in jsdom, so no need to unset it here.
    document.execCommand = vi.fn(() => true);

    await createRoomAndGetCreatedPanel();

    const copyLinkButton = document.querySelector<HTMLButtonElement>('[data-copy="link"]')!;
    fireEvent.click(copyLinkButton);
    await flush();

    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(copyLinkButton.textContent).toBe("Copied!");
  });

  it("shows 'Copy failed' when neither the Clipboard API nor execCommand succeed", async () => {
    // Both navigator.clipboard and document.execCommand are unavailable by default in jsdom.
    await createRoomAndGetCreatedPanel();

    const copyPasswordButton = document.querySelector<HTMLButtonElement>('[data-copy="password"]')!;
    fireEvent.click(copyPasswordButton);
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

    expect(document.querySelector("[data-link-join]")).not.toBeNull();
    expect(document.querySelector("[data-tabs-mode]")).toBeNull();
    expect(screen.getByText("ABCDEF")).toBeTruthy();
  });

  it("pre-fills the remembered username for that room", () => {
    localStorage.setItem("road-to-survival:lastUsername:ABCDEF", "carol");
    navigateToJoinLink("ABCDEF");

    showRoomGate();

    const usernameInput = screen.getByLabelText("Username") as HTMLInputElement;
    expect(usernameInput.value).toBe("carol");
  });

  it("resolves and remembers the username on a successful link join", async () => {
    const fakeRoom = { id: "room-1" };
    mockJoinRoom.mockResolvedValueOnce(fakeRoom);
    navigateToJoinLink("ABCDEF");

    const roomPromise = showRoomGate();

    fireEvent.input(screen.getByLabelText("Username"), { target: { value: "dave" } });
    fireEvent.submit(getForm("link-join"));
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

    fireEvent.input(screen.getByLabelText("Username"), { target: { value: "eve" } });
    fireEvent.submit(getForm("link-join"));
    await flush();

    expect(document.querySelector<HTMLElement>("[data-password-field]")!.hidden).toBe(false);
    expect(screen.getByText(message)).toBeTruthy();
  });
});
