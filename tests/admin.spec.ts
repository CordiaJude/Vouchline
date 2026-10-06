import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";

test.describe("unauthenticated guards", () => {
  test("admin dashboard redirects to login", async ({ page }) => {
    await page.goto("/app/admin/00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/login/);
  });

  test("invite page redirects to login", async ({ page }) => {
    await page.goto("/invite/sometoken");
    await expect(page).toHaveURL(/\/login/);
  });

  test("admin metrics page redirects to login", async ({ page }) => {
    await page.goto("/app/admin/00000000-0000-0000-0000-000000000000/metrics");
    await expect(page).toHaveURL(/\/login/);
  });
});

// Non-admins should never see the dashboard's contents. Gated the same way
// as the other live-only suites in this repo (needs a real signed-in,
// non-admin account).
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

test.describe("admin dashboard (live Supabase only)", () => {
  test.skip(!liveSupabase, "requires PLAYWRIGHT_LIVE_SUPABASE=1 + local stack");

  test("non-admin gets blocked from the admin dashboard", async ({ page }) => {
    const memberEmail = process.env.PLAYWRIGHT_ADMIN_NONADMIN_EMAIL;
    const orgId = process.env.PLAYWRIGHT_ADMIN_ORG_ID;
    test.skip(
      !memberEmail || !orgId,
      "requires PLAYWRIGHT_ADMIN_NONADMIN_EMAIL / PLAYWRIGHT_ADMIN_ORG_ID",
    );

    await signInViaMagicLink(page, memberEmail!);
    const response = await page.goto(`/app/admin/${orgId}`);
    expect(response?.status()).toBe(404);
  });

  test("admin can import a 5-row roster CSV", async ({ page }) => {
    const adminEmail = process.env.PLAYWRIGHT_ADMIN_EMAIL;
    const orgId = process.env.PLAYWRIGHT_ADMIN_ORG_ID;
    test.skip(
      !adminEmail || !orgId,
      "requires PLAYWRIGHT_ADMIN_EMAIL / PLAYWRIGHT_ADMIN_ORG_ID",
    );

    await signInViaMagicLink(page, adminEmail!);
    await page.goto(`/app/admin/${orgId}`);

    const csv = [
      "full_name,email,grad_year,pledge_class",
      ...Array.from(
        { length: 5 },
        (_, i) =>
          `Test Roster ${i},roster_test_${Date.now()}_${i}@example.com,20${20 + i},Fall 20${20 + i}`,
      ),
    ].join("\n");

    const dir = mkdtempSync(path.join(tmpdir(), "roster-"));
    const csvPath = path.join(dir, "roster.csv");
    writeFileSync(csvPath, csv);

    await page.locator('input[name="csv"]').setInputFiles(csvPath);
    await page.getByRole("button", { name: "Import roster" }).click();

    await expect(page.getByText(/invited 5, skipped 0/i)).toBeVisible();
  });
});
