import { expect, test } from "@playwright/test";
import { ADMIN, login, unique } from "./helpers";

test("admin moves in a tenant, records a reading and a payment, and a receipt is issued", async ({
  page,
}) => {
  await login(page, ADMIN);
  await expect(page).toHaveURL(/\/admin$/);

  // Move in: the first vacant room, a new tenant.
  const id = unique();
  const last4 = id.slice(-4);
  await page.goto("/admin/move-in");
  const roomSelect = page.getByLabel("Room");
  const firstVacant = roomSelect.locator("option:not([value=''])").first();
  const room = await firstVacant.getAttribute("value");
  expect(room, "a vacant room is needed (run npm run db:reset)").toBeTruthy();
  await roomSelect.selectOption(room!);
  await page.getByLabel("First name").fill("Erin");
  await page.getByLabel("Last name").fill(`Test${id}`);
  await page.getByLabel("Phone 1").fill(`0900 000 ${last4}`);
  await page.getByLabel("Starting meter reading (kWh)").fill("1000");
  await expect(page.getByLabel("Username")).toHaveValue(`room${room}-erin-${last4}`);
  await page.getByRole("button", { name: "Move in" }).click();
  await expect(page.getByText(`Erin Test${id} moved into room ${room}.`)).toBeVisible();

  // Monthly reading: 1,000 → 1,040 = 40 kWh at the seeded ₱15/kWh = ₱600.
  await page.goto(`/admin/readings?room=${room}`);
  await expect(page.getByText("Last reading:")).toBeVisible();
  await page.getByLabel("New reading (kWh)").fill("1040");
  await expect(page.getByText("40 kWh").first()).toBeVisible();
  await page.getByRole("button", { name: /Save reading/ }).click();
  await expect(page.getByRole("status")).toContainText(`Saved for room ${room}: 40 kWh`);
  await expect(page.getByRole("status")).toContainText("₱600");

  // Cash payment, applied oldest first, with a receipt.
  await page.goto(`/admin/payments?room=${room}`);
  await page.getByLabel("Amount (₱)").fill("600");
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByText(/Payment saved: ₱600 applied/)).toBeVisible();
  const receiptLink = page.getByRole("link", { name: /Receipt #\d+/ }).first();
  const receiptNo = (await receiptLink.innerText()).match(/\d+/)![0];

  const pdf = await page.request.get(`/receipts/${receiptNo}`);
  expect(pdf.ok()).toBe(true);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});
