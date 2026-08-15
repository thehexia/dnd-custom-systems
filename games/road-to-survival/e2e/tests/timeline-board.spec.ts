import { expect, test } from "@playwright/test";
import { fillAndSubmit, observeRoom } from "./helpers.js";

async function createRoomAndJoinSecond(
  browser: import("@playwright/test").Browser,
  adminUsername: string,
  otherUsername: string,
): Promise<{
  contextA: import("@playwright/test").BrowserContext;
  contextB: import("@playwright/test").BrowserContext;
  pageA: import("@playwright/test").Page;
  pageB: import("@playwright/test").Page;
  code: string;
}> {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  await pageA.goto("/");
  await fillAndSubmit(pageA, '[data-form="create"]', { username: adminUsername });
  await expect(pageA.locator("[data-created]")).toBeVisible();

  const joinLink = (await pageA.locator("[data-created-link]").textContent())?.trim();
  const code = (await pageA.locator("[data-created-code]").textContent())?.trim();
  expect(joinLink).toBeTruthy();
  expect(code).toBeTruthy();

  await pageA.locator("[data-continue]").click();
  await expect(pageA.locator("canvas")).toBeVisible();

  const pageB = await contextB.newPage();
  await pageB.goto(joinLink!);
  await fillAndSubmit(pageB, '[data-form="link-join"]', { username: otherUsername });
  await expect(pageB.locator("canvas")).toBeVisible();

  return { contextA, contextB, pageA, pageB, code: code! };
}

// Pixel coordinates for the vertical nav bar's canvas-rendered elements, derived from the
// layout constants in MainScene.ts (canvas is a fixed 800x600 and not CSS-scaled, so page
// coordinates map 1:1 to game coordinates). Segment 1's tile: default 5-day week -> 10 segments,
// nav bar right-docked with a 30px margin and 150px tile width -> navX = 620; tiles start at
// NAV_TOP = 130 with a computed tileHeight of 38px, so tile 1 spans y 130-168 (center ~149) and
// tile 2 spans y 174-212 (center ~193).
const TILE_1_CENTER = { x: 695, y: 149 };
const TILE_2_CENTER = { x: 695, y: 193 };
const JUMP_TO_CURRENT_DAY = { x: 650, y: 83 };

test("initial load shows Day 1 in the segment content area", async ({ browser }) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();

  try {
    await pageA.goto("/");
    await fillAndSubmit(pageA, '[data-form="create"]', { username: "day-one" });
    await expect(pageA.locator("[data-created]")).toBeVisible();
    await pageA.locator("[data-continue]").click();
    await expect(pageA.locator("canvas")).toBeVisible();

    await expect(pageA.locator("#app")).toHaveAttribute("data-segment-label", "Day 1, Day-time");
  } finally {
    await contextA.close();
  }
});

test("selecting a nav bar segment does not affect the room, and jump-to-current-day returns to it", async ({
  browser,
}) => {
  const { contextA, contextB, pageA, pageB, code } = await createRoomAndJoinSecond(browser, "nav-a", "nav-b");

  try {
    // Advance the room to segment 2 so the current segment (2) and segment 1's tile differ.
    await pageA.locator('[data-action="ready"]').click();
    await pageB.locator('[data-action="ready"]').click();

    const { room: observerRoom } = await observeRoom(code);
    try {
      await expect.poll(() => observerRoom.state.timeline.segment, { timeout: 5_000 }).toBe(2);

      // Selection defaults to following the current segment.
      await expect(pageA.locator("#app")).toHaveAttribute("data-selected-segment", "2");

      await pageA.locator("canvas").click({ position: TILE_1_CENTER });
      await expect(pageA.locator("#app")).toHaveAttribute("data-selected-segment", "1");
      await expect(pageA.locator("#app")).toHaveAttribute("data-segment-label", "Day 1, Day-time");
      expect(observerRoom.state.timeline.segment).toBe(2); // room state is unaffected by selection

      await pageA.locator("canvas").click({ position: JUMP_TO_CURRENT_DAY });
      await expect(pageA.locator("#app")).toHaveAttribute("data-selected-segment", "2");
    } finally {
      await observerRoom.leave();
    }
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("clicking a different nav bar tile updates the selected segment", async ({ browser }) => {
  const { contextA, contextB, pageA } = await createRoomAndJoinSecond(browser, "nav-tile-a", "nav-tile-b");

  try {
    await pageA.locator("canvas").click({ position: TILE_2_CENTER });
    await expect(pageA.locator("#app")).toHaveAttribute("data-selected-segment", "2");
    await expect(pageA.locator("#app")).toHaveAttribute("data-segment-label", "Day 1, Night-time");
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("two players ready up and the shared timeline advances to segment 2 for both clients", async ({ browser }) => {
  const { contextA, contextB, pageA, pageB, code } = await createRoomAndJoinSecond(browser, "ready-a", "ready-b");

  try {
    await pageA.locator('[data-action="ready"]').click();
    await pageB.locator('[data-action="ready"]').click();

    const { room: observerRoom } = await observeRoom(code);
    try {
      await expect.poll(() => observerRoom.state.timeline.segment, { timeout: 5_000 }).toBe(2);
    } finally {
      await observerRoom.leave();
    }
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("driving a room through the full default week reaches week-end, and the admin's continue resets to week 2", async ({
  browser,
}) => {
  const { contextA, contextB, pageA, pageB, code } = await createRoomAndJoinSecond(browser, "week-a", "week-b");

  try {
    for (let round = 0; round < 10; round++) {
      await expect(pageA.locator('[data-action="ready"]')).toBeEnabled();
      await expect(pageB.locator('[data-action="ready"]')).toBeEnabled();
      await pageA.locator('[data-action="ready"]').click();
      await pageB.locator('[data-action="ready"]').click();
    }

    await expect(pageA.locator("[data-week-end]")).toBeVisible();
    await expect(pageB.locator("[data-week-end]")).toBeVisible();

    await pageA.locator('[data-action="continue"]').click();

    const { room: observerRoom } = await observeRoom(code);
    try {
      await expect.poll(() => observerRoom.state.timeline.week, { timeout: 5_000 }).toBe(2);
      expect(observerRoom.state.timeline.segment).toBe(1);
      expect(observerRoom.state.timeline.phase).toBe("active");
    } finally {
      await observerRoom.leave();
    }
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
