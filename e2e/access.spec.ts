import { expect, test } from "@playwright/test";
import { BERT, FRANNIE, login, loginAs } from "./helpers";

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/admin/payments");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fpayments/);
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/login/);
});

test("a tenant cannot open the admin pages", async ({ page }) => {
  await login(page, FRANNIE);
  for (const path of ["/admin", "/admin/tenants", "/admin/payments/review", "/admin/settings"]) {
    await page.goto(path);
    await expect(page, `${path} should send the tenant home`).toHaveURL(/\/portal$/);
    await expect(page.getByText("Total to pay")).toBeVisible();
  }
});

test("a tenant cannot open another tenant's receipt", async ({ page, browser }) => {
  const firstReceipt = async (p: typeof page) => {
    await p.goto("/portal/payments");
    const link = p.getByRole("link", { name: /View receipt #\d+/ }).first();
    return Number((await link.innerText()).match(/\d+/)![0]);
  };
  const bert = await loginAs(browser, BERT);
  const bertsReceipt = await firstReceipt(bert);

  await login(page, FRANNIE);
  const own = await firstReceipt(page);
  expect((await page.request.get(`/receipts/${own}`)).status()).toBe(200);
  expect((await page.request.get(`/receipts/${bertsReceipt}`)).status()).toBe(404);
});
