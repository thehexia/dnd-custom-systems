import { expect, test } from "@playwright/test";
import { fillAndSubmit } from "./helpers.js";

test("create, share, and join a room end-to-end", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();

  try {
    const pageA = await contextA.newPage();
    await pageA.goto("/");
    await fillAndSubmit(pageA, '[data-form="create"]', { username: "alice" });
    await expect(pageA.locator("[data-created]")).toBeVisible();

    const joinLink = (await pageA.locator("[data-created-link]").textContent())?.trim();
    const code = (await pageA.locator("[data-created-code]").textContent())?.trim();
    expect(joinLink).toBeTruthy();
    expect(code).toBeTruthy();

    await pageA.locator("[data-continue]").click();
    await expect(pageA.locator("canvas")).toBeVisible();
    await expect(pageA.locator('[data-action="ready"]')).toBeVisible();

    const pageB = await contextB.newPage();
    await pageB.goto(joinLink!);
    await expect(pageB.locator("[data-link-join]")).toBeVisible();
    await fillAndSubmit(pageB, '[data-form="link-join"]', { username: "bob" });
    await expect(pageB.locator("canvas")).toBeVisible();
    await expect(pageB.locator('[data-action="ready"]')).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
