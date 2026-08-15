import { expect, test } from "@playwright/test";
import { fillAndSubmit, observeRoom } from "./helpers.js";

test("admin rejoin requires the room password and restores admin identity", async ({ browser }) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await pageA.goto("/");
  await fillAndSubmit(pageA, '[data-form="create"]', { username: "carol" });
  await expect(pageA.locator("[data-created]")).toBeVisible();

  const code = (await pageA.locator("[data-created-code]").textContent())?.trim();
  const password = (await pageA.locator("[data-created-password]").textContent())?.trim();
  expect(code).toBeTruthy();
  expect(password).toBeTruthy();

  await pageA.locator("[data-continue]").click();
  await expect(pageA.locator("canvas")).toBeVisible();

  const { room: preDisconnectObserver, players: preDisconnectPlayers } = await observeRoom(code!);
  await expect.poll(() => preDisconnectPlayers.get("carol")?.isAdmin, { timeout: 5_000 }).toBe(true);
  await preDisconnectObserver.leave();

  // Simulate the admin disconnecting (closing the tab/losing connection).
  await contextA.close();

  const contextC = await browser.newContext();
  const pageC = await contextC.newPage();
  await pageC.goto("/");
  await pageC.locator('[data-tab="join"]').click();

  await fillAndSubmit(pageC, '[data-form="join"]', { code: code!, username: "carol" });
  const joinError = pageC.locator('[data-error="join"]');
  await expect(joinError).not.toHaveText("");
  await expect(
    pageC.locator('[data-form="join"] [data-password-field]'),
  ).toBeVisible();
  await expect(pageC.locator("canvas")).not.toBeVisible();

  await fillAndSubmit(pageC, '[data-form="join"]', { code: code!, username: "carol", password: password! });
  await expect(pageC.locator("canvas")).toBeVisible();

  const { room: postRejoinObserver, players: postRejoinPlayers } = await observeRoom(code!);
  try {
    await expect.poll(() => postRejoinPlayers.get("carol")?.isAdmin, { timeout: 5_000 }).toBe(true);
  } finally {
    await postRejoinObserver.leave();
    await contextC.close();
  }
});
