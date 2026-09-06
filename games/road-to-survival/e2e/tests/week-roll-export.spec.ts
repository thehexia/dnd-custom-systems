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

test("the admin can export the week's rolls as a downloaded Markdown file, and a non-admin never sees the control", async ({
  browser,
}) => {
  const { contextA, contextB, pageA, pageB } = await createRoomAndJoinSecond(browser, "export-a", "export-b");

  try {
    await expect(pageB.locator('[data-action="export-week-rolls"]')).toHaveCount(0);

    const [download] = await Promise.all([
      pageA.waitForEvent("download"),
      pageA.locator('[data-action="export-week-rolls"]').click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/^week-1-rolls\.md$/);

    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(path!, "utf-8");
    expect(content).toContain("# Week 1 Rolls");
    expect(content).toContain("Segment 1");
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
