import { test, expect } from "@playwright/test";

test.describe("unauthenticated guards", () => {
  test("intros list redirects to login", async ({ page }) => {
    await page.goto("/app/intros");
    await expect(page).toHaveURL(/\/login/);
  });

  test("intro detail redirects to login", async ({ page }) => {
    await page.goto("/app/intros/00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/login/);
  });

  test("new intro form redirects to login", async ({ page }) => {
    await page.goto("/app/intros/new");
    await expect(page).toHaveURL(/\/login/);
  });
});

// Full happy path needs three independently signed-in, mutually-connected
// accounts (requester -> broker -> target, no direct requester-target
// edge), so it needs a live Supabase local stack -- same gate as the other
// live-only suites in this repo.
const liveSupabase = process.env.PLAYWRIGHT_LIVE_SUPABASE === "1";

test.describe("intro request happy path (live Supabase only)", () => {
  test.skip(!liveSupabase, "requires PLAYWRIGHT_LIVE_SUPABASE=1 + local stack");

  test("requester -> broker -> target accept flow completes", async ({
    browser,
  }) => {
    // Requires PLAYWRIGHT_INTRO_REQUESTER_EMAIL/_BROKER_EMAIL/_TARGET_EMAIL
    // for three already-onboarded accounts where requester<->broker and
    // broker<->target are confirmed connections, with no direct
    // requester<->target edge -- wired up by whoever runs this live.
    const requesterEmail = process.env.PLAYWRIGHT_INTRO_REQUESTER_EMAIL;
    const brokerEmail = process.env.PLAYWRIGHT_INTRO_BROKER_EMAIL;
    const targetEmail = process.env.PLAYWRIGHT_INTRO_TARGET_EMAIL;
    test.skip(
      !requesterEmail || !brokerEmail || !targetEmail,
      "requires PLAYWRIGHT_INTRO_REQUESTER_EMAIL / _BROKER_EMAIL / _TARGET_EMAIL",
    );

    const targetId = process.env.PLAYWRIGHT_INTRO_TARGET_ID;
    const brokerId = process.env.PLAYWRIGHT_INTRO_BROKER_ID;
    test.skip(
      !targetId || !brokerId,
      "requires PLAYWRIGHT_INTRO_TARGET_ID / _BROKER_ID",
    );

    const mailpitUrl = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

    async function signIn(page: import("@playwright/test").Page, email: string) {
      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Send magic link" }).click();
      await expect(page.getByText(/check your inbox/i)).toBeVisible();

      let link: string | undefined;
      for (let attempt = 0; attempt < 20 && !link; attempt++) {
        const res = await page.request.get(
          `${mailpitUrl}/api/v1/search?query=to:${encodeURIComponent(email)}`,
        );
        const body = await res.json();
        const messageId = body?.messages?.[0]?.ID;
        if (messageId) {
          const msg = await page.request.get(
            `${mailpitUrl}/api/v1/message/${messageId}`,
          );
          const msgBody = await msg.json();
          const match = /https?:\/\/[^\s"]+\/auth\/callback[^\s"]*/.exec(
            msgBody.Text ?? msgBody.HTML ?? "",
          );
          link = match?.[0];
        }
        if (!link) await page.waitForTimeout(500);
      }
      if (!link) throw new Error(`No magic link email arrived for ${email}`);
      await page.goto(link);
    }

    const requesterCtx = await browser.newContext();
    const brokerCtx = await browser.newContext();
    const targetCtx = await browser.newContext();
    const requesterPage = await requesterCtx.newPage();
    const brokerPage = await brokerCtx.newPage();
    const targetPage = await targetCtx.newPage();

    await signIn(requesterPage, requesterEmail!);
    await signIn(brokerPage, brokerEmail!);
    await signIn(targetPage, targetEmail!);

    await requesterPage.goto(
      `/app/intros/new?target=${targetId}&broker=${brokerId}`,
    );
    await requesterPage
      .getByLabel(/message to/i)
      .fill("Would love an introduction -- this is a Playwright test run.");
    await requesterPage
      .getByRole("button", { name: /ask .* for an intro/i })
      .click();
    await expect(requesterPage).toHaveURL(/\/app\/intros\//);

    await brokerPage.goto("/app/intros?tab=broker");
    await brokerPage.getByRole("link").first().click();
    await brokerPage.getByRole("button", { name: "Make the intro" }).click();
    await expect(brokerPage.getByText(/waiting on them/i)).toBeVisible();

    await targetPage.goto("/app/intros?tab=target");
    await targetPage.getByRole("link").first().click();
    await targetPage.getByRole("button", { name: "Accept" }).click();
    await expect(targetPage.getByText(/^Status: Accepted$/)).toBeVisible();

    await requesterCtx.close();
    await brokerCtx.close();
    await targetCtx.close();
  });
});
