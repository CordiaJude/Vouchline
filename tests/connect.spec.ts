import { test, expect, type Page } from "@playwright/test";

test.describe("unauthenticated guards", () => {
  test("connect page redirects to login", async ({ page }) => {
    await page.goto("/app/connect");
    await expect(page).toHaveURL(/\/login/);
  });

  test("network list redirects to login", async ({ page }) => {
    await page.goto("/app/network");
    await expect(page).toHaveURL(/\/login/);
  });

  test("search page redirects to login", async ({ page }) => {
    await page.goto("/app/search");
    await expect(page).toHaveURL(/\/login/);
  });

  test("pending connections redirects to login", async ({ page }) => {
    await page.goto("/app/connections/pending");
    await expect(page).toHaveURL(/\/login/);
  });

  test("notifications redirects to login", async ({ page }) => {
    await page.goto("/app/notifications");
    await expect(page).toHaveURL(/\/login/);
  });

  test("claim page redirects to login", async ({ page }) => {
    await page.goto("/app/claim");
    await expect(page).toHaveURL(/\/login/);
  });

  test("connect request page redirects to login", async ({ page }) => {
    await page.goto("/app/connect/request?person=00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/login/);
  });

  test("targets page redirects to login", async ({ page }) => {
    await page.goto("/app/targets");
    await expect(page).toHaveURL(/\/login/);
  });

  test("companies page redirects to login", async ({ page }) => {
    await page.goto("/app/companies");
    await expect(page).toHaveURL(/\/login/);
  });

  test("company detail page redirects to login", async ({ page }) => {
    await page.goto("/app/companies/Acme%20Co");
    await expect(page).toHaveURL(/\/login/);
  });

  test("scanning a connect token while logged out redirects to login", async ({
    page,
  }) => {
    await page.goto("/c/somesampletoken");
    await expect(page).toHaveURL(/\/login/);
  });

  test("sticker link while logged out redirects to login", async ({
    page,
  }) => {
    await page.goto("/c/u/00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/login/);
  });
});

// The full QR handshake needs two independently signed-in users (two
// browser contexts, two magic-link sign-ins via Mailpit), so it needs a
// live Supabase local stack -- same gate as tests/profile.spec.ts.
const liveSupabase = process.env.PLAYWRIGHT_LIVE_SUPABASE === "1";
const mailpitUrl = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

async function signInViaMagicLink(page: Page, email: string) {
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

test.describe("QR connect flow (live Supabase only)", () => {
  test.skip(!liveSupabase, "requires PLAYWRIGHT_LIVE_SUPABASE=1 + local stack");

  test("two users in the same org become a confirmed connection", async ({
    browser,
  }) => {
    // Both accounts must already be onboarded and share an org -- wired up
    // by whoever runs this live, since that setup needs seeded roster data.
    const emailA = process.env.PLAYWRIGHT_QR_USER_A_EMAIL;
    const emailB = process.env.PLAYWRIGHT_QR_USER_B_EMAIL;
    test.skip(
      !emailA || !emailB,
      "requires PLAYWRIGHT_QR_USER_A_EMAIL / _B_EMAIL for two already-onboarded, same-org accounts",
    );

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    await signInViaMagicLink(pageA, emailA!);
    await signInViaMagicLink(pageB, emailB!);

    await pageA.goto("/app/connect");
    const qrImg = pageA.getByAltText("Connect QR code");
    await expect(qrImg).toBeVisible();

    // Playwright can't decode the rendered QR image, so pull the token out
    // of the page's own known state via localStorage/DOM instead of OCR:
    // simplest reliable path is to intercept the RPC response.
    const [rpcResponse] = await Promise.all([
      pageA.waitForResponse((res) => res.url().includes("create_connect_token")),
      pageA.reload(),
    ]);
    const token = (await rpcResponse.json()) as string;

    await pageB.goto(`/c/${token}`);
    await expect(pageB.getByText(/how do you know/i)).toBeVisible();
    await pageB.getByLabel("Friend").check();
    await pageB.locator('select[name="years"]').selectOption("3");
    await pageB.locator('select[name="strength"]').selectOption("2");
    await pageB.getByRole("button", { name: "Confirm connection" }).click();
    await expect(pageB).toHaveURL(/\/app/);

    await pageA.goto("/app/connections/pending");
    await pageA.getByLabel("Friend").check();
    await pageA.locator('select[name="years"]').selectOption("3");
    await pageA.locator('select[name="strength"]').selectOption("2");
    await pageA.getByRole("button", { name: "Confirm" }).click();

    await pageA.goto("/app/network");
    await expect(pageA.getByText("Friend")).toBeVisible();

    await contextA.close();
    await contextB.close();
  });
});
