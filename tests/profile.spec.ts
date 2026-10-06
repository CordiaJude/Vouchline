import { test, expect, type Page } from "@playwright/test";

test.describe("unauthenticated guards", () => {
  test("onboarding redirects to login when logged out", async ({ page }) => {
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/login/);
  });

  test("profile page redirects to login when logged out", async ({
    page,
  }) => {
    await page.goto("/app/u/00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/login/);
  });

  test("settings redirects to login when logged out", async ({ page }) => {
    await page.goto("/app/settings");
    await expect(page).toHaveURL(/\/login/);
  });

  test("my profile redirects to login when logged out", async ({ page }) => {
    await page.goto("/app/me");
    await expect(page).toHaveURL(/\/login/);
  });
});

// These exercise the real onboarding + cross-org-404 acceptance criteria,
// but need a running Supabase local stack (Auth + Mailpit for the magic
// link) to sign in. That's not available in every environment this repo
// runs in, so they're gated behind PLAYWRIGHT_LIVE_SUPABASE and skipped
// otherwise rather than silently faked.
const liveSupabase = process.env.PLAYWRIGHT_LIVE_SUPABASE === "1";
const mailpitUrl = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

async function signInViaMagicLink(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send magic link" }).click();
  await expect(page.getByText(/check your inbox/i)).toBeVisible();

  // Poll Mailpit's API for the message and pull the magic link out of it.
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

test.describe("onboarding + profile visibility (live Supabase only)", () => {
  test.skip(!liveSupabase, "requires PLAYWRIGHT_LIVE_SUPABASE=1 + local stack");

  test("onboarding without an invite shows the form directly (no org gate)", async ({
    page,
  }) => {
    const email = `pw_noninvite_${Date.now()}@example.com`;
    await signInViaMagicLink(page, email);
    await page.goto("/onboarding");
    await expect(page.getByLabel(/full name/i)).toBeVisible();

    await page.getByLabel(/full name/i).fill("Playwright Tester");
    await page.getByLabel(/i confirm that i am 18/i).check();
    await page.getByRole("button", { name: "Finish setup" }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText("Playwright Tester")).toBeVisible();
  });

  test("onboarding via a valid invite joins that org", async ({ page }) => {
    // Minting a real invite needs an existing admin account, so this is
    // passed in by whoever wires up the live run rather than created here.
    const inviteToken = process.env.PLAYWRIGHT_INVITE_TOKEN;
    const email = process.env.PLAYWRIGHT_INVITE_EMAIL;
    test.skip(
      !inviteToken || !email,
      "requires PLAYWRIGHT_INVITE_TOKEN + PLAYWRIGHT_INVITE_EMAIL (a multi-use invite works if it has no email restriction)",
    );

    await signInViaMagicLink(page, email!);
    await page.goto(`/onboarding?invite=${inviteToken}`);
    await expect(page.getByLabel(/full name/i)).toBeVisible();

    await page.getByLabel(/full name/i).fill("Playwright Tester");
    await page.getByLabel(/i confirm that i am 18/i).check();
    await page.getByRole("button", { name: "Finish setup" }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByText("Playwright Tester")).toBeVisible();
  });

  test("profile in a different org 404s", async ({ page }) => {
    // Assumes a seeded profile id outside the signed-in user's org, passed
    // in by whoever wires up the live run.
    const outsideOrgProfileId = process.env.PLAYWRIGHT_OUTSIDE_ORG_PROFILE_ID;
    test.skip(
      !outsideOrgProfileId,
      "requires PLAYWRIGHT_OUTSIDE_ORG_PROFILE_ID",
    );

    const email = `pw_crossorg_${Date.now()}@example.com`;
    await signInViaMagicLink(page, email);

    await page.goto(`/app/u/${outsideOrgProfileId}`);
    await expect(page.getByText(/this page could not be found/i)).toBeVisible();
  });
});
