import { test, expect } from "@playwright/test";
test("complete user journey and responsive layout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByLabel("Senha", { exact: true })
    .fill(process.env.DEMO_PASSWORD || "Demo1234!");
  await page.getByRole("button", { name: "Entrar", exact: false }).click();
  await expect(page.locator("header")).toBeVisible();
  await page
    .locator('button:not(:disabled)', { hasText: "Adicionar ao carrinho" })
    .first()
    .click();
  await page.getByRole("button", { name: "Finalizar compra simulada" }).click();
  await expect(page.locator("[role=status]")).toContainText(
    "Pedido confirmado",
  );
  await page.getByRole("button", { name: "Meus pedidos" }).click();
  await expect(page.locator(".order").first()).toContainText("Confirmado");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    if (width === 1440)
      await page.screenshot({ path: "docs/screenshots/desktop.png", fullPage: true });
  }
  expect(errors).toEqual([]);
});
