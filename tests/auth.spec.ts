import { test, expect } from "@playwright/test";

test("app redirects to login when logged out", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
});

test("landing page links to signup", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/signup/);
});

test("landing page links to login", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /already have an account/i }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("signup page redirects to login", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("login page links to forgot password", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
});

test("reset password page redirects to forgot-password when no session", async ({
  page,
}) => {
  await page.goto("/reset-password");
  await expect(page).toHaveURL(/\/forgot-password/);
});
