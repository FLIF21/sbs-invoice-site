import { expect, test, type Page } from "@playwright/test";

const sectionHeadings: Array<[string, string]> = [
  ["Аналитика", "Пульс продаж"],
  ["Счета", "История счетов"],
  ["Клиенты", "База клиентов"],
  ["Цены изделий", "Цены изделий"],
  ["Металл", "Стоимость металла"],
  ["Коэффициенты", "Коэффициенты"],
  ["НДС", "Настройка НДС"],
  ["Реквизиты", "Реквизиты"],
  ["Нумерация", "Нумерация счетов"],
  ["Пользователи", "Пользователи и права"],
  ["История изменений", "История изменений"],
  ["Резервные копии", "Резервные копии"],
];

async function layoutAudit(page: Page, rootSelector: string) {
  return page.evaluate((selector) => {
    const root = document.querySelector<HTMLElement>(selector)!;
    const interactive = [...root.querySelectorAll<HTMLElement>("button,input,select,textarea,a")]
      .filter((element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden"
          && bounds.width > 0 && bounds.height > 0
          && bounds.right > 0 && bounds.left < innerWidth && bounds.bottom > 0 && bounds.top < innerHeight;
      })
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          name: element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent?.trim() || element.tagName,
          width: bounds.width,
          height: bounds.height,
        };
      });
    return {
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      rootLeft: root.getBoundingClientRect().left,
      rootRight: root.getBoundingClientRect().right,
      tooSmall: interactive.filter((element) => element.width < 44 || element.height < 44),
    };
  }, rootSelector);
}

for (const width of [320, 360, 390, 700]) {
  test(`страница входа помещается в экран ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/login");

    await expect(page.getByRole("heading", { name: "Вход в систему" })).toBeVisible();
    const layout = await layoutAudit(page, ".login-page");
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.rootLeft).toBeGreaterThanOrEqual(0);
    expect(layout.rootRight).toBeLessThanOrEqual(layout.viewport);
    expect(layout.tooSmall).toEqual([]);
  });
}

test("форма входа сохраняет доступность полей и переключателя пароля", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill("admin@example.test");
  const password = page.locator(".password-field input");
  await password.fill("test-password");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Показать пароль" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.getByRole("link", { name: "Забыли пароль?" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Вернуться к калькулятору/ })).toBeVisible();
});

test("все разделы админки открываются, тема переключается, логотип не обрезается", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin");

  for (const [navigationLabel, heading] of sectionHeadings) {
    await page.getByRole("button", { name: navigationLabel, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }

  await page.getByRole("button", { name: "Цены изделий", exact: true }).click();
  await expect(page.locator(".product-formula-list article")).toHaveCount(1);
  await expect(page.locator(".product-formula-list")).toContainText("S = 2 × (A + B) × L / 1 000 000 × количество");
  await expect(page.getByRole("button", { name: /Добавить изделие/ })).toBeVisible();

  await page.getByRole("button", { name: "Реквизиты", exact: true }).click();
  await expect(page.getByAltText("Логотип компании")).toHaveCSS("object-fit", "contain");

  await page.getByRole("button", { name: "Тёмная тема" }).click();
  await expect(page.locator(".admin-app")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Светлая тема" }).click();
  await expect(page.locator(".admin-app")).toHaveAttribute("data-theme", "light");
});

test("новое изделие создаётся с выбранной формулой и ценой", async ({ page }) => {
  let requestBody: unknown;
  await page.route("**/api/admin/products", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requestBody = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "new-product", ok: true }) });
  });

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/admin");
  await page.locator(".menu-button").click();
  await expect(page.locator(".admin-sidebar")).toHaveCSS("left", "0px");
  await page.getByRole("button", { name: "Цены изделий", exact: true }).click();
  await page.getByRole("button", { name: /Добавить изделие/ }).click();

  const modal = page.locator(".product-modal");
  await expect(modal).toBeVisible();
  await modal.getByLabel("Название").fill("Заслонка дополнительная");
  await modal.getByLabel("Код").fill("damperExtra");
  await modal.getByLabel("Категория").fill("Регулирующие изделия");
  await modal.getByLabel("Метод расчёта").selectOption("round-damper");
  await expect(modal.locator(".selected-formula")).toContainText("π × D × L");
  await modal.getByLabel("Цена за м² с НДС").fill("5000");
  await modal.getByLabel("Доля металла").fill("1");

  const bounds = await modal.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, viewportWidth: innerWidth };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);

  await modal.getByRole("button", { name: "Добавить изделие", exact: true }).click();
  await expect(page.getByText("Новое изделие добавлено в калькулятор")).toBeVisible();
  expect(requestBody).toEqual({
    code: "damperExtra",
    name: "Заслонка дополнительная",
    category: "Регулирующие изделия",
    formulaKey: "round-damper",
    rates: [{ thicknessId: "e2e-thickness", targetGrossRate: 5000, materialMultiplier: 1 }],
  });
});

test("изделие можно отредактировать и удалить из калькулятора", async ({ page }) => {
  const requests: Array<{ method: string; body: unknown }> = [];
  await page.route("**/api/admin/products/e2e-product", async (route) => {
    requests.push({
      method: route.request().method(),
      body: route.request().postData() ? route.request().postDataJSON() : null,
    });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "e2e-product", ok: true }) });
  });

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/admin");
  await page.locator(".menu-button").click();
  await page.getByRole("button", { name: "Цены изделий", exact: true }).click();

  await page.getByRole("button", { name: "Редактировать Воздуховод" }).click();
  const editModal = page.locator(".product-modal");
  await expect(editModal.getByRole("heading", { name: "Редактировать изделие" })).toBeVisible();
  await editModal.getByLabel("Название").fill("Воздуховод усиленный");
  await editModal.getByLabel("Категория").fill("Воздуховоды на заказ");
  await editModal.getByLabel("Метод расчёта").selectOption("rectangular-damper");
  await editModal.getByRole("button", { name: "Сохранить изделие", exact: true }).click();
  await expect(page.getByText("Изделие обновлено")).toBeVisible();

  await page.getByRole("button", { name: "Удалить Воздуховод" }).click();
  const deleteModal = page.locator(".delete-product-modal");
  await expect(deleteModal.getByRole("heading", { name: "Удалить изделие?" })).toBeVisible();
  await expect(deleteModal).toContainText("Уже созданные счета останутся без изменений");
  await deleteModal.getByRole("button", { name: "Удалить изделие", exact: true }).click();
  await expect(page.getByText("Изделие удалено из калькулятора")).toBeVisible();

  expect(requests).toEqual([
    {
      method: "PUT",
      body: {
        code: "duct",
        name: "Воздуховод усиленный",
        category: "Воздуховоды на заказ",
        formulaKey: "rectangular-damper",
      },
    },
    { method: "DELETE", body: null },
  ]);
});

test("статусы счетов отображаются по-русски, сохраняя серверные значения", async ({ page }) => {
  await page.route("**/api/admin/invoices/e2e-invoice", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "e2e-invoice",
        number: "СБС-00041",
        status: "ISSUED",
        issueDate: "2026-08-20T12:00:00.000Z",
        dueDate: null,
        project: null,
        requestNumber: null,
        applicant: null,
        notes: null,
        subtotal: 20_000,
        taxAmount: 4_000,
        total: 24_000,
        tax: { enabled: true, rate: 20 },
        company: { name: "СБС", legalName: "ООО", inn: null, kpp: null, ogrn: null, bankName: null, bik: null, checking: null, correspondent: null, address: null, phone: null, email: null, website: null },
        client: { name: "ООО «Тестовый клиент»", inn: "7707083893", kpp: "770701001", address: "Москва", phone: "", email: "" },
        items: [{ productId: "e2e-product", productCode: "duct", productName: "Воздуховод", description: "Воздуховод 400×250", dimensions: { width: 400, height: 250, length: 1_500 }, thicknessCode: "0.5", quantity: 1, area: 1.95, netUnitPrice: 10_000, grossUnitPrice: 12_000, netTotal: 20_000, grossTotal: 24_000, pricingSnapshot: {} }],
      }),
    });
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: "Счета", exact: true }).click();
  await expect(page.locator(".status-pill").filter({ hasText: "Выставлен" })).toBeVisible();
  await expect(page.locator(".status-pill").filter({ hasText: "Оплачен" })).toBeVisible();
  await expect(page.getByText("ISSUED", { exact: true })).toHaveCount(0);
  await expect(page.getByText("PAID", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: /СБС-00041/ }).click();
  await expect(page.locator(".invoice-facts")).toContainText("Выставлен");
  await page.getByRole("button", { name: "Редактировать" }).click();

  const status = page.getByLabel("Статус");
  await expect(status).toHaveValue("ISSUED");
  await expect(status.locator("option").allTextContents()).resolves.toEqual(["Черновик", "Выставлен", "Оплачен", "Отменён"]);
});

for (const width of [320, 360, 390, 700]) {
  test(`админка и мобильное меню помещаются в экран ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Пульс продаж" })).toBeVisible();

    let layout = await layoutAudit(page, ".admin-app");
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.rootLeft).toBeGreaterThanOrEqual(0);
    expect(layout.rootRight).toBeLessThanOrEqual(layout.viewport);
    expect(layout.tooSmall).toEqual([]);

    await page.locator(".menu-button").click();
    await expect(page.locator(".admin-sidebar")).toHaveClass(/open/);
    await expect(page.locator(".admin-sidebar")).toHaveCSS("left", "0px");
    const sidebarBounds = await page.locator(".admin-sidebar").evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, width: bounds.width };
    });
    expect(sidebarBounds.left).toBeGreaterThanOrEqual(0);
    expect(sidebarBounds.right).toBeLessThanOrEqual(width);

    await page.getByRole("button", { name: "Цены изделий", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Цены изделий", exact: true })).toBeVisible();
    layout = await layoutAudit(page, ".admin-app");
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.tooSmall).toEqual([]);
  });
}

test("админка сохраняет reflow при масштабе 200%", async ({ page }) => {
  await page.setViewportSize({ width: 350, height: 900 });
  await page.goto("/admin");
  await page.locator(".menu-button").click();
  await page.getByRole("button", { name: "Реквизиты", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Реквизиты", exact: true })).toBeVisible();
  await expect(page.getByAltText("Логотип компании")).toHaveCSS("object-fit", "contain");
  const layout = await layoutAudit(page, ".admin-app");
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewport);
  expect(layout.tooSmall).toEqual([]);
});

test("модальные окна пользователей помещаются в мобильный экран", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/admin");
  await page.locator(".menu-button").click();
  await page.getByRole("button", { name: "Пользователи", exact: true }).click();
  await page.getByRole("button", { name: /Добавить пользователя/ }).click();

  const modal = page.locator(".admin-modal");
  await expect(modal).toBeVisible();
  const bounds = await modal.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
});
