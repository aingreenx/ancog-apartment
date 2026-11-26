import { expect, test } from "@playwright/test";
import { ADMIN, FRANNIE, login, loginAs, unique } from "./helpers";

test("tenant sees only their own bills, pays by GCash, and the admin confirms it", async ({
  page,
  browser,
}) => {
  await login(page, FRANNIE);
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByText("Room 3", { exact: true })).toBeVisible();

  // Only Frannie's bills: other tenants' charges and names never appear.
  await page.goto("/portal/bills");
  await expect(page.getByText(/Electricity/).first()).toBeVisible();
  const bills = await page.locator("main").innerText();
  for (const other of ["Bert", "Carla", "Dino", "Replacement key", "Room 5", "Room 8", "Room 12"]) {
    expect(bills, `bills page mentions ${other}`).not.toContain(other);
  }

  // GCash payment, waiting for confirmation.
  const ref = `E2E${unique()}`;
  await page.goto("/portal/pay");
  await expect(page.getByText("1. Send by GCash to")).toBeVisible();
  await page.getByLabel("Amount sent (₱)").fill("150");
  await page.getByLabel("GCash reference no.").fill(ref);
  await page.getByRole("button", { name: "I sent it" }).click();
  await expect(page.getByText("Sent! Thank you.")).toBeVisible();
  await page.goto("/portal/payments");
  const mine = page.locator("li").filter({ hasText: ref });
  await expect(mine).toContainText("Waiting for confirmation");

  // The admin confirms it from the review queue.
  const admin = await loginAs(browser, ADMIN);
  await admin.goto("/admin/payments/review");
  const card = admin.locator("li").filter({ hasText: ref });
  await expect(card).toContainText("₱150");
  await card.getByRole("button", { name: /Confirm/ }).click();
  await expect(admin.locator("li").filter({ hasText: ref })).toHaveCount(0);

  // The tenant sees it received, with a receipt.
  await page.reload();
  await expect(mine).toContainText("Received");
  await expect(mine.getByRole("link", { name: /receipt #\d+/i }).first()).toBeVisible();
});
