import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { Credits } from "./credits.js";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Credits", () => {
  it("does not show the credits panel until the trigger is activated", () => {
    render(<Credits />);
    expect(document.querySelector("[data-credits-panel]")).toBeNull();
  });

  it("shows the attributed assets with author and license once opened", () => {
    render(<Credits />);
    fireEvent.click(screen.getByRole("button", { name: "Credits" }));

    const panel = document.querySelector("[data-credits-panel]");
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("Sun icon");
    expect(panel?.textContent).toContain("Lorc");
    expect(panel?.textContent).toContain("CC BY 3.0");
    expect(panel?.textContent).toContain("Moon icon");
  });

  it("hides the panel again when the trigger is activated a second time", () => {
    render(<Credits />);
    const trigger = screen.getByRole("button", { name: "Credits" });

    fireEvent.click(trigger);
    expect(document.querySelector("[data-credits-panel]")).not.toBeNull();

    fireEvent.click(trigger);
    expect(document.querySelector("[data-credits-panel]")).toBeNull();
  });
});
