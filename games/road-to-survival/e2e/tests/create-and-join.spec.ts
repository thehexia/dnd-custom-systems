import { expect, test } from "@playwright/test";
import { fillAndSubmit, observeRoom } from "./helpers.js";

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

    const pageB = await contextB.newPage();
    await pageB.goto(joinLink!);
    await expect(pageB.locator("[data-link-join]")).toBeVisible();
    await fillAndSubmit(pageB, '[data-form="link-join"]', { username: "bob" });
    await expect(pageB.locator("canvas")).toBeVisible();

    // Move each player by clicking their canvas, then verify the authoritative server state --
    // observed independently of either browser -- reflects both players having moved. This
    // exercises the real sync path (real server, real Postgres-backed room) without depending
    // on Phaser canvas pixel inspection.
    await pageA.locator("canvas").click({ position: { x: 100, y: 150 } });
    await pageB.locator("canvas").click({ position: { x: 300, y: 250 } });

    const { room: observerRoom, snapshots } = await observeRoom(code!);
    try {
      await expect.poll(() => snapshots.get("alice")?.x ?? 0, { timeout: 5_000 }).toBeGreaterThan(0);
      await expect.poll(() => snapshots.get("bob")?.x ?? 0, { timeout: 5_000 }).toBeGreaterThan(0);
    } finally {
      await observerRoom.leave();
    }
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
