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
