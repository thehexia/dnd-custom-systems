import { expect, test } from "@playwright/test";

test("activating the credits control shows the attributed assets", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("[data-credits-panel]")).toBeHidden();

  await page.locator("[data-credits-trigger]").click();

  const panel = page.locator("[data-credits-panel]");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Sun icon");
  await expect(panel).toContainText("Moon icon");
  await expect(panel).toContainText("Lorc");
  await expect(panel).toContainText("CC BY 3.0");
});
