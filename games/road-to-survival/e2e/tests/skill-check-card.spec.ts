import { expect, test } from "@playwright/test";
import { fillAndSubmit } from "./helpers.js";

async function createRoomAndJoinSecond(
  browser: import("@playwright/test").Browser,
  adminUsername: string,
  otherUsername: string,
): Promise<{
  contextA: import("@playwright/test").BrowserContext;
  contextB: import("@playwright/test").BrowserContext;
  pageA: import("@playwright/test").Page;
  pageB: import("@playwright/test").Page;
}> {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  await pageA.goto("/");
  await fillAndSubmit(pageA, '[data-form="create"]', { username: adminUsername });
  await expect(pageA.locator("[data-created]")).toBeVisible();

  const joinLink = (await pageA.locator("[data-created-link]").textContent())?.trim();
  expect(joinLink).toBeTruthy();

  await pageA.locator("[data-continue]").click();
  await expect(pageA.locator("canvas")).toBeVisible();

  const pageB = await contextB.newPage();
  await pageB.goto(joinLink!);
  await fillAndSubmit(pageB, '[data-form="link-join"]', { username: otherUsername });
  await expect(pageB.locator("canvas")).toBeVisible();

  return { contextA, contextB, pageA, pageB };
}

interface CardOption {
  skill: string;
  dc: number;
  voters: string[];
}

async function readCardOptions(page: import("@playwright/test").Page): Promise<CardOption[]> {
  const attr = await page.locator("#app").getAttribute("data-card-options");
  return JSON.parse(attr ?? "[]") as CardOption[];
}

// Pixel coordinates for the first content-card option row's canvas-rendered click zone, derived
// from the layout constants in MainScene.ts (canvas is a fixed 1100x750 and not CSS-scaled --
// see timeline-board.spec.ts's TILE_1_CENTER comment for why page coordinates map 1:1 to game
// coordinates). Row 0 spans y OPTIONS_TOP(128) to +OPTION_ROW_HEIGHT(76), center y = 166; x=500
// sits inside the row's [56, 814] horizontal span.
const OPTION_ROW_0_CENTER = { x: 500, y: 166 };

test("two players see the same generated card, and a cast vote appears live for both", async ({ browser }) => {
  const { contextA, contextB, pageA, pageB } = await createRoomAndJoinSecond(browser, "card-a", "card-b");

  try {
    await expect.poll(async () => (await readCardOptions(pageA)).length, { timeout: 5_000 }).toBe(4);
    await expect.poll(async () => (await readCardOptions(pageB)).length, { timeout: 5_000 }).toBe(4);

    const optionsA = await readCardOptions(pageA);
    const optionsB = await readCardOptions(pageB);
    expect(optionsB).toEqual(optionsA);

    const skills = optionsA.map((o) => o.skill);
    expect(new Set(skills).size).toBe(4);
    for (const option of optionsA) {
      expect(option.dc).toBeGreaterThanOrEqual(5);
      expect(option.dc).toBeLessThanOrEqual(20);
      expect(option.voters).toEqual([]);
    }

    await pageA.locator("canvas").click({ position: OPTION_ROW_0_CENTER });

    await expect
      .poll(async () => (await readCardOptions(pageB))[0]?.voters, { timeout: 5_000 })
      .toEqual(["card-a"]);
    // The voter's own view updates too, not just the other player's.
    expect((await readCardOptions(pageA))[0]?.voters).toEqual(["card-a"]);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test("revisiting the current segment's card (re-render) does not change its contents", async ({ browser }) => {
  const { contextA, pageA } = await createRoomAndJoinSecond(browser, "card-revisit-a", "card-revisit-b");

  try {
    await expect.poll(async () => (await readCardOptions(pageA)).length, { timeout: 5_000 }).toBe(4);
    const first = await readCardOptions(pageA);

    // Force a re-render by toggling the ready state, which re-renders the timeline/card without
    // regenerating it.
    await pageA.locator('[data-action="ready"]').click();
    await expect(pageA.locator('[data-action="ready"]')).toBeDisabled();

    const second = await readCardOptions(pageA);
    expect(second.map((o) => ({ skill: o.skill, dc: o.dc }))).toEqual(first.map((o) => ({ skill: o.skill, dc: o.dc })));
  } finally {
    await contextA.close();
  }
});
