import { expect, test, type Browser, type Page } from "@playwright/test";

// Seeded local accounts (supabase/seed.sql). Never real people.
export const ADMIN = "admin1@ancog.local";
export const FRANNIE = "room3-frannie-4612";
export const BERT = "room5-bert-2231";
export const PASSWORD = "password123";

export async function login(page: Page, username: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** A separate signed-in browser context (another person on another phone). */
export async function loginAs(browser: Browser, username: string) {
  const { baseURL } = test.info().project.use;
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await login(page, username);
  return page;
}

/** Short unique suffix so repeated runs don't collide. */
export const unique = () => String(Date.now()).slice(-6);
