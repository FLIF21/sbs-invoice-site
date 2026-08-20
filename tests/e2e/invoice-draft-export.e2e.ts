import { expect, test } from "@playwright/test";

async function setDateInput(page: import("@playwright/test").Page, label: string, value: string) {
  await page.getByLabel(label, { exact: true }).evaluate((element: HTMLInputElement, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, nextValue);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: nextValue, inputType: "insertText" }));
  }, value);
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function fillValidInvoice(page: import("@playwright/test").Page) {
  await page.getByLabel("Покупатель").fill("ООО «Проверка дат»");
  await page.getByLabel("Ширина A, мм").fill("400");
  await page.getByLabel("Ширина B, мм").fill("250");
  await page.getByLabel("Длина L, мм").fill("1500");
}

test("reload сохраняет черновик, а PDF и Excel используют один счёт", async ({ page }) => {
  const testInvoices = new Map<string, { id: string; number: string }>();
  let postRequests = 0;
  let paymentRequests = 0;

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

  await page.route("**/api/public/invoices/invoice-e2e-1/payment", async (route) => {
    paymentRequests += 1;
    const origin = new URL(route.request().url()).origin;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ alreadyPaid: false, paymentId: "payment-e2e-1", confirmationUrl: `${origin}/payment/e2e-target` }),
    });
  });
  await page.route("**/payment/e2e-target", (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: "<main><h1>Тестовая платёжная страница</h1></main>",
  }));

  await page.goto("/");
  await expect(page.locator("article.product")).toHaveCount(1);
  await expect(page.getByLabel("Номер счёта")).toHaveValue("Будет присвоен после сохранения");
  await expect(page.getByLabel("Ширина A, мм")).toHaveValue("");
  await expect(page.getByLabel("Ширина B, мм")).toHaveValue("");
  await expect(page.getByLabel("Длина L, мм")).toHaveValue("");
  await expect(page.getByText("Заполните размеры изделия").first()).toBeVisible();
  await expect(page.locator("aside.summary").getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Скачать PDF" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Оплатить (тест)" })).toBeDisabled();

  await page.getByLabel("Покупатель").fill("ООО «E2E Покупатель»");
  await page.getByLabel("ИНН").fill("1234567890");
  await page.getByLabel("КПП").fill("123456789");
  await page.getByLabel("Адрес").fill("Москва, длинный тестовый адрес, дом 1");
  await page.getByLabel("Проект").fill("E2E проект");
  await page.getByLabel("№ заявки").fill("E2E-42");
  const issueDate = await page.getByLabel("Дата", { exact: true }).inputValue();
  await page.getByLabel("Требуется к").fill(issueDate);
  await page.getByLabel("Ширина A, мм").fill("400,5");
  await page.getByLabel("Ширина B, мм").fill("250");
  await page.getByLabel("Длина L, мм").fill("1500");
  await page.getByRole("button", { name: /Добавить изделие/ }).click();
  await expect(page.locator("article.product")).toHaveCount(2);
  await page.getByLabel("Ширина A, мм").nth(1).fill("300.5");
  await page.getByLabel("Ширина B, мм").nth(1).fill("200");
  await page.getByLabel("Длина L, мм").nth(1).fill("1200");

  await page.reload();
  await expect(page.getByLabel("Покупатель")).toHaveValue("ООО «E2E Покупатель»");
  await expect(page.getByLabel("Проект")).toHaveValue("E2E проект");
  await expect(page.getByLabel("Требуется к")).toHaveValue(issueDate);
  await expect(page.locator("article.product")).toHaveCount(2);
  await expect(page.getByRole("status")).toHaveAttribute("aria-live", "polite");
  await expect(page.getByRole("status")).toHaveAttribute("aria-atomic", "true");
  await expect(page.getByRole("status")).toContainText("Черновик восстановлен");

  const totalBeforeRemoval = await page.locator("aside.summary .grand b").textContent();
  await page.getByRole("button", { name: "Удалить позицию 2" }).click();
  await expect(page.locator("article.product")).toHaveCount(1);
  await expect(page.locator("aside.summary .grand b")).not.toHaveText(totalBeforeRemoval ?? "");
  await expect(page.getByRole("button", { name: "Удалить позицию 1" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Удалить позицию 1" })).toHaveCSS("width", "44px");
  await page.getByRole("button", { name: /Добавить изделие/ }).click();
  await page.getByLabel("Ширина A, мм").nth(1).fill("300.5");
  await page.getByLabel("Ширина B, мм").nth(1).fill("200");
  await page.getByLabel("Длина L, мм").nth(1).fill("1200");

  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать PDF" }).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  const pdfFile = await pdfDownload;
  await pdfFile.cancel();
  await expect(page.getByText("PDF скачан. Счёт № E2E-000001")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Номер счёта")).toHaveValue("E2E-000001");
  const excelDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать Excel" }).click();
  const excelFile = await excelDownload;
  await excelFile.cancel();
  await expect(page.getByText("Excel скачан. Счёт № E2E-000001")).toBeVisible();

  await Promise.all([
    page.waitForURL("**/payment/e2e-target"),
    page.getByRole("button", { name: "Оплатить (тест)" }).click(),
  ]);
  await expect(page.getByRole("heading", { name: "Тестовая платёжная страница" })).toBeVisible();

  expect(postRequests).toBe(1);
  expect(paymentRequests).toBe(1);
  expect(testInvoices.size).toBe(1);
  expect([...testInvoices.values()]).toEqual([{ id: "invoice-e2e-1", number: "E2E-000001" }]);
});

test("даты связаны с формой, блокируют экспорт и сохраняются без сдвига", async ({ page }) => {
  await page.goto("/");
  await fillValidInvoice(page);

  const issueDate = await page.getByLabel("Дата", { exact: true }).inputValue();
  const laterDate = shiftDate(issueDate, 7);
  const earlierDate = shiftDate(issueDate, -1);

  await setDateInput(page, "Дата", issueDate);
  await setDateInput(page, "Требуется к", issueDate);
  await expect(page.getByLabel("Требуется к")).toHaveAttribute("aria-invalid", "false");
  await expect(page.getByRole("button", { name: "Скачать PDF" })).toBeEnabled();

  await setDateInput(page, "Требуется к", laterDate);
  await expect(page.getByLabel("Требуется к")).toHaveValue(laterDate);
  await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeEnabled();

  await page.reload();
  await expect(page.getByLabel("Дата", { exact: true })).toHaveValue(issueDate);
  await expect(page.getByLabel("Требуется к")).toHaveValue(laterDate);
  await expect(page.getByRole("button", { name: "Скачать PDF" })).toBeEnabled();

  await setDateInput(page, "Дата", laterDate);
  await expect(page.getByLabel("Требуется к")).toHaveAttribute("min", laterDate);

  await setDateInput(page, "Дата", issueDate);
  await setDateInput(page, "Требуется к", earlierDate);

  await expect(page.locator("#invoice-due-date-error")).toHaveText("Дата готовности не может быть раньше даты счёта");
  await expect(page.getByLabel("Требуется к")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Скачать PDF" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Скачать Excel" })).toBeDisabled();
});

test("ширины A и B не могут быть меньше 150 мм", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Покупатель").fill("ООО «Проверка размеров»");
  await page.getByLabel("Ширина A, мм").fill("149");
  await page.getByLabel("Ширина B, мм").fill("150");
  await page.getByLabel("Длина L, мм").fill("1000");

  await expect(page.locator("#item-1-width-error")).toHaveText("Ширина A: значение должно быть не меньше 150 мм");
  await expect(page.getByRole("button", { name: "Скачать PDF" })).toBeDisabled();

  await page.getByLabel("Ширина A, мм").fill("150");
  await page.getByLabel("Ширина B, мм").fill("149");
  await expect(page.locator("#item-1-height-error")).toHaveText("Ширина B: значение должно быть не меньше 150 мм");
  await expect(page.getByRole("button", { name: "Скачать PDF" })).toBeDisabled();

  await page.getByLabel("Ширина B, мм").fill("150");
  await expect(page.getByRole("button", { name: "Скачать PDF" })).toBeEnabled();
});

for (const width of [320, 360, 390, 700]) {
  test(`интерактивные области и карточка помещаются в экран ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");

    const productType = page.getByLabel("Тип изделия").first();
    const remove = page.getByRole("button", { name: "Удалить позицию 1" });
    await expect(productType).toBeVisible();
    await expect(remove).toBeDisabled();
    await productType.selectOption({ label: "Переход прямоугольный → прямоугольный" });
    await expect(page.locator(".selected-product-name")).toHaveText("Переход прямоугольный → прямоугольный");

    const layout = await page.evaluate(() => {
      const card = document.querySelector("article.product")!.getBoundingClientRect();
      const select = document.querySelector<HTMLSelectElement>(".product-head select")!.getBoundingClientRect();
      const button = document.querySelector<HTMLButtonElement>(".product-head .remove")!.getBoundingClientRect();
      const selectedName = document.querySelector<HTMLElement>(".selected-product-name")!;
      const productImage = document.querySelector<HTMLImageElement>(".product-photo img")!;
      const interactive = [...document.querySelectorAll<HTMLElement>(".public-site button,.public-site input,.public-site select,.public-site textarea,.public-site a")]
        .filter((element) => getComputedStyle(element).display !== "none")
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          return { tag: element.tagName, name: element.getAttribute("aria-label") || element.textContent?.trim() || "", width: bounds.width, height: bounds.height };
        });
      return {
        viewport: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        selectLeft: select.left,
        selectRight: select.right,
        selectTop: select.top,
        buttonLeft: button.left,
        buttonBottom: button.bottom,
        cardLeft: card.left,
        cardRight: card.right,
        tooSmall: interactive.filter((element) => element.width < 44 || element.height < 44),
        selectedNameFits: selectedName.scrollWidth <= selectedName.clientWidth && selectedName.scrollHeight <= selectedName.clientHeight,
        productImageFit: getComputedStyle(productImage).objectFit,
      };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.selectLeft).toBeGreaterThanOrEqual(layout.cardLeft);
    expect(layout.selectRight).toBeLessThanOrEqual(layout.cardRight);
    expect(layout.selectTop).toBeGreaterThanOrEqual(layout.buttonBottom);
    expect(layout.cardRight).toBeLessThanOrEqual(layout.viewport);
    expect(layout.tooSmall).toEqual([]);
    expect(layout.selectedNameFits).toBe(true);
    expect(layout.productImageFit).toBe("contain");
  });
}

test("интерфейс сохраняет reflow при масштабе 200%", async ({ page }) => {
  // Browser zoom 200% at 700 CSS pixels gives an effective layout viewport of 350px.
  await page.setViewportSize({ width: 350, height: 900 });
  await page.goto("/");

  const layout = await page.evaluate(() => {
    const interactive = [...document.querySelectorAll<HTMLElement>(".public-site button,.public-site input,.public-site select,.public-site textarea,.public-site a")]
      .filter((element) => getComputedStyle(element).display !== "none")
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      });
    return {
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      tooSmall: interactive.filter((element) => element.width < 44 || element.height < 44),
      productTypeVisible: document.querySelector<HTMLSelectElement>(".product-head select")!.getBoundingClientRect().width > 0,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport);
  expect(layout.tooSmall).toEqual([]);
  expect(layout.productTypeVisible).toBe(true);
});
