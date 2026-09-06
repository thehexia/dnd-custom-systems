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

interface CardOption {
  skill: string;
  dc: number;
  voters: string[];
}

async function readCardOptions(page: import("@playwright/test").Page): Promise<CardOption[]> {
  const attr = await page.locator("#app").getAttribute("data-card-options");
  return JSON.parse(attr ?? "[]") as CardOption[];
}

function rosterLeadTokens(page: import("@playwright/test").Page, username: string) {
  return page.locator(`[data-roster] .game-roster-tab:has-text("${username}")`);
}

// Pixel coordinates for the content card's canvas-rendered option rows, derived from the layout
// constants in MainScene.ts (see skill-check-card.spec.ts's OPTION_ROW_0_CENTER comment for why
// page coordinates map 1:1 to game coordinates). Row i's center y = OPTIONS_TOP(128) + i *
// (OPTION_ROW_HEIGHT(76) + OPTION_ROW_GAP(14)) + OPTION_ROW_HEIGHT/2.
const OPTION_ROW_0_CENTER = { x: 500, y: 166 };
const OPTION_ROW_1_CENTER = { x: 500, y: 256 };

test("hunted mode: a confirmed Forced March advances the segment (not the vote itself), Lead tokens aren't spent until the segment resolves, votes can be retracted for free, and a token-less player can't cast a new vote", async ({
  browser,
}) => {
  const { contextA, contextB, pageA, pageB, code } = await createRoomAndJoinSecond(browser, "hunted-a", "hunted-b");

  try {
    const { room: observerRoom } = await observeRoom(code);
    try {
      // Admin switches the room to Hunted Mode.
      await pageA.locator('[data-action="toggle-mode"]').click();
      await expect.poll(() => observerRoom.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

      // The admin never votes for a Forced March (see the dedicated lockout test below), so the
      // majority is evaluated only over connected non-admin players -- "hunted-b" and the
      // permanently-joined observer client, both of which vote here to reach it. It only unlocks
      // the admin's confirmation -- it does not advance the segment by itself.
      await expect(pageA.locator('[data-action="vote-skip"]')).toBeDisabled();
      await expect(pageB.locator('[data-action="vote-skip"]')).toBeVisible();
      observerRoom.send("vote-skip");
      await pageB.locator('[data-action="vote-skip"]').click();
      await expect.poll(() => observerRoom.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
      expect(observerRoom.state.timeline.segment).toBe(1);

      // Only the admin confirming actually advances the timeline.
      await expect(pageA.locator('[data-action="confirm-skip"]')).toBeEnabled();
      await pageA.locator('[data-action="confirm-skip"]').click();
      await expect.poll(() => observerRoom.state.timeline.segment, { timeout: 5_000 }).toBe(2);

      // The confirmed Forced March unlocks the admin's one-time Lead token assignment.
      await expect(pageA.locator('[data-action="assign-lead-tokens"]')).toBeEnabled();
      await pageA.locator('[data-action="assign-lead-tokens"]').click();
      await expect(rosterLeadTokens(pageA, "hunted-a")).toHaveAttribute("data-lead-tokens", "1");
      await expect(rosterLeadTokens(pageA, "hunted-b")).toHaveAttribute("data-lead-tokens", "1");

      // Casting a vote does not spend the token -- it's only reserved.
      await expect.poll(async () => (await readCardOptions(pageA)).length, { timeout: 5_000 }).toBe(4);
      await pageA.locator("canvas").click({ position: OPTION_ROW_0_CENTER });
      await expect
        .poll(async () => (await readCardOptions(pageB))[0]?.voters, { timeout: 5_000 })
        .toEqual(["hunted-a"]);
      await expect(rosterLeadTokens(pageA, "hunted-a")).toHaveAttribute("data-lead-tokens", "1");

      // Clicking the same option again retracts the vote -- still at no cost.
      await pageA.locator("canvas").click({ position: OPTION_ROW_0_CENTER });
      await expect
        .poll(async () => (await readCardOptions(pageB))[0]?.voters, { timeout: 5_000 })
        .toEqual([]);
      await expect(rosterLeadTokens(pageA, "hunted-a")).toHaveAttribute("data-lead-tokens", "1");

      // Voting for a different option afterward is a fresh vote, also unconsumed for now.
      await pageA.locator("canvas").click({ position: OPTION_ROW_1_CENTER });
      await expect
        .poll(async () => (await readCardOptions(pageB))[1]?.voters, { timeout: 5_000 })
        .toEqual(["hunted-a"]);
      await expect(rosterLeadTokens(pageA, "hunted-a")).toHaveAttribute("data-lead-tokens", "1");

      // hunted-a's active vote now locks out Forced March voting entirely (see the dedicated
      // lockout test below), and this room's permanently-joined observer client never readies --
      // so neither a second Forced March nor a ready-up can resolve this segment. The admin's
      // forward override isn't gated by an active vote, though, and resolves the segment the same
      // way, spending the token for whichever player still has an active vote there -- only the
      // admin, here.
      await pageA.locator('[data-action="override-next"]').click();
      await expect.poll(() => observerRoom.state.timeline.segment, { timeout: 5_000 }).toBe(3);
      await expect(rosterLeadTokens(pageA, "hunted-a")).toHaveAttribute("data-lead-tokens", "0");
      await expect(rosterLeadTokens(pageA, "hunted-b")).toHaveAttribute("data-lead-tokens", "1");

      // With zero tokens left, the admin's attempt to cast a new vote on segment 3 is rejected.
      await expect.poll(async () => (await readCardOptions(pageA)).length, { timeout: 5_000 }).toBe(4);
      await pageA.locator("canvas").click({ position: OPTION_ROW_0_CENTER });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect((await readCardOptions(pageA))[0]?.voters).toEqual([]);
    } finally {
      await observerRoom.leave();
    }
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

function forcedMarchReason(page: import("@playwright/test").Page) {
  return page.locator("[data-forced-march-reason]");
}

test("hunted mode: the admin can't vote for a Forced March, an active skill-check vote locks the option out for everyone with an explanation, and casting one withdraws an already-pending majority", async ({
  browser,
}) => {
  const { contextA, contextB, pageA, pageB, code } = await createRoomAndJoinSecond(browser, "lock-a", "lock-b");

  try {
    const { room: observerRoom } = await observeRoom(code);
    try {
      // Admin switches the room to Hunted Mode.
      await pageA.locator('[data-action="toggle-mode"]').click();
      await expect.poll(() => observerRoom.state.timeline.mode, { timeout: 5_000 }).toBe("hunted");

      // The admin's own Forced March control is disabled from the start, with an explanation --
      // the admin never votes for a Forced March.
      await expect(pageA.locator('[data-action="vote-skip"]')).toBeDisabled();
      await expect(forcedMarchReason(pageA)).toHaveText("The admin doesn't vote on the Forced March.");

      // The majority is evaluated only over connected non-admin players -- "lock-b" and the
      // permanently-joined observer client, both of which vote here to reach it. Confirming
      // advances the segment and unlocks a Lead-token assignment.
      observerRoom.send("vote-skip");
      await pageB.locator('[data-action="vote-skip"]').click();
      await expect.poll(() => observerRoom.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
      await pageA.locator('[data-action="confirm-skip"]').click();
      await expect.poll(() => observerRoom.state.timeline.segment, { timeout: 5_000 }).toBe(2);
      await pageA.locator('[data-action="assign-lead-tokens"]').click();
      await expect(rosterLeadTokens(pageB, "lock-b")).toHaveAttribute("data-lead-tokens", "1");

      // A second Forced March vote reaches majority again, awaiting the admin's confirmation.
      observerRoom.send("vote-skip");
      await pageB.locator('[data-action="vote-skip"]').click();
      await expect.poll(() => observerRoom.state.timeline.skipConfirmationAvailable, { timeout: 5_000 }).toBe(true);
      await expect(pageA.locator('[data-action="confirm-skip"]')).toBeEnabled();

      // The non-admin spends their Lead token to roll a check instead -- this withdraws the
      // party's Forced March, even though a majority was already awaiting confirmation.
      await expect.poll(async () => (await readCardOptions(pageB)).length, { timeout: 5_000 }).toBe(4);
      await pageB.locator("canvas").click({ position: OPTION_ROW_0_CENTER });
      await expect
        .poll(() => observerRoom.state.timeline.skipConfirmationAvailable, { timeout: 5_000 })
        .toBe(false);
      await expect(pageA.locator('[data-action="confirm-skip"]')).toBeDisabled();

      // With an active skill-check vote now on the current segment, Forced March voting locks
      // out for everyone, with an explanation -- including the player who cast it.
      await expect(pageB.locator('[data-action="vote-skip"]')).toBeDisabled();
      await expect(forcedMarchReason(pageB)).toHaveText("Someone has already voted to roll a check this segment.");

      // Retracting the vote lifts the lockout.
      await pageB.locator("canvas").click({ position: OPTION_ROW_0_CENTER });
      await expect
        .poll(async () => (await readCardOptions(pageA))[0]?.voters, { timeout: 5_000 })
        .toEqual([]);
      await expect(pageB.locator('[data-action="vote-skip"]')).toBeEnabled();
    } finally {
      await observerRoom.leave();
    }
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
