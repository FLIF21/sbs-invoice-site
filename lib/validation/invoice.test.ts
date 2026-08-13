import { describe, expect, it } from "vitest";
import { invoiceInputSchema, MAX_INVOICE_ITEM_QUANTITY } from "./invoice";
import { nextDate, todayInMoscow } from "./dates";

const today = todayInMoscow();

const validInvoice = {
  idempotencyKey: "6f5769dc-5c8b-4f1f-a39e-6b2c16af5084",
  issueDate: today,
  dueDate: nextDate(today),
  project: "Тестовый проект",
  requestNumber: "789678687",
  applicant: "Павел",
  notes: "",
  client: {
    name: "ООО \"ГарантРестав\"",
    inn: "172345679021",
    kpp: "24543515",
    address: "г. Москва, Стахановская, 20",
    phone: "89178902345",
    email: "faza@mail.ru",
  },
  items: [{
    productCode: "duct",
    thicknessCode: "0.5",
    quantity: 1_000_000,
    dimensions: { width: 400, height: 250, length: 1_500, rail: "20/20" },
  }],
};

describe("invoiceInputSchema", () => {
  it("принимает производственную партию из 1 000 000 изделий", () => {
    const parsed = invoiceInputSchema.parse(validInvoice);

    expect(parsed.items[0].quantity).toBe(1_000_000);
  });

  it("возвращает понятную ошибку при превышении безопасного лимита", () => {
    const result = invoiceInputSchema.safeParse({
      ...validInvoice,
      items: [{ ...validInvoice.items[0], quantity: MAX_INVOICE_ITEM_QUANTITY + 1 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]).toMatchObject({
        path: ["items", 0, "quantity"],
        message: "не должно превышать 1 000 000 000",
      });
    }
  });

  it("отклоняет дробное количество и отрицательный размер", () => {
    const fractional = invoiceInputSchema.safeParse({
      ...validInvoice,
      items: [{ ...validInvoice.items[0], quantity: 1.5 }],
    });
    const negative = invoiceInputSchema.safeParse({
      ...validInvoice,
      items: [{ ...validInvoice.items[0], dimensions: { ...validInvoice.items[0].dimensions, width: -400 } }],
    });

    expect(fractional.success).toBe(false);
    expect(negative.success).toBe(false);
  });

  it("отклоняет дату в прошлом", () => {
    const result = invoiceInputSchema.safeParse({ ...validInvoice, issueDate: "2026-08-12" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]).toMatchObject({ path: ["issueDate"] });
  });
});
