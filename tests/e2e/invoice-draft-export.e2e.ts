import { expect, test } from "@playwright/test";

test("reload сохраняет черновик, а PDF и Excel используют один счёт", async ({ page }) => {
  const testInvoices = new Map<string, { id: string; number: string }>();
  let postRequests = 0;

  await page.route("**/api/public/invoices", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    postRequests += 1;
    const input = route.request().postDataJSON();
    const saved = testInvoices.get(input.idempotencyKey) ?? { id: "invoice-e2e-1", number: "E2E-000001" };
    testInvoices.set(input.idempotencyKey, saved);
    const lines = input.items.map((item: { productCode: string; thicknessCode: string; quantity: number; dimensions: Record<string, unknown> }, index: number) => ({
      productId: `product-${index + 1}`,
      productCode: item.productCode,
      productName: `Изделие ${index + 1}`,
      description: `Тестовое изделие ${index + 1}`,
      dimensions: item.dimensions,
      thicknessCode: item.thicknessCode,
      quantity: item.quantity,
      area: 1.25,
      netUnitPrice: 500,
      grossUnitPrice: 610,
      netTotal: 500 * item.quantity,
      grossTotal: 610 * item.quantity,
      pricingSnapshot: {},
    }));
    const subtotal = lines.reduce((sum: number, line: { netTotal: number }) => sum + line.netTotal, 0);
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ...saved,
        status: "ISSUED",
        issueDate: `${input.issueDate}T12:00:00.000Z`,
        dueDate: input.dueDate ? `${input.dueDate}T12:00:00.000Z` : null,
        project: input.project || null,
        requestNumber: input.requestNumber || null,
        applicant: input.applicant || null,
        notes: null,
        subtotal,
        taxAmount: subtotal * 0.22,
        total: subtotal * 1.22,
        tax: { enabled: true, rate: 22 },
        client: input.client,
        company: {
          name: "СБС", legalName: "ООО «ФЮСИС-В»", inn: "0000000000", kpp: "000000000",
          ogrn: null, address: "Тестовый адрес поставщика", bankName: "Тестовый банк", bik: "000000000",
          checking: "40702810000000000000", correspondent: "30101810000000000000",
          phone: "+7 000 000-00-00", email: "test@example.com", website: "sbs-schet.online", logoUrl: null,
        },
        items: lines,
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Покупатель").fill("ООО «E2E Покупатель»");
  await page.getByLabel("ИНН").fill("1234567890");
  await page.getByLabel("КПП").fill("123456789");
  await page.getByLabel("Адрес").fill("Москва, длинный тестовый адрес, дом 1");
  await page.getByLabel("Проект").fill("E2E проект");
  await page.getByLabel("№ заявки").fill("E2E-42");
  await page.getByRole("button", { name: /Добавить изделие/ }).click();
  await expect(page.locator("article.product")).toHaveCount(2);

  await page.reload();
  await expect(page.getByLabel("Покупатель")).toHaveValue("ООО «E2E Покупатель»");
  await expect(page.getByLabel("Проект")).toHaveValue("E2E проект");
  await expect(page.locator("article.product")).toHaveCount(2);

  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать счёт в PDF" }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  const pdfFile = await pdfDownload;
  await pdfFile.cancel();
  await expect(page.getByText("PDF скачан. Счёт № E2E-000001")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Следующий номер")).toHaveValue("E2E-000001");
  const excelDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать счёт в Excel" }).click();
  const excelFile = await excelDownload;
  await excelFile.cancel();
  await expect(page.getByText("Excel скачан. Счёт № E2E-000001")).toBeVisible();

  expect(postRequests).toBe(1);
  expect(testInvoices.size).toBe(1);
  expect([...testInvoices.values()]).toEqual([{ id: "invoice-e2e-1", number: "E2E-000001" }]);
});
