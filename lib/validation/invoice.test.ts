import { describe, expect, it } from "vitest";
import { invoiceInputSchema, MAX_INVOICE_ITEM_QUANTITY } from "./invoice";

const validInvoice = {
  issueDate: "2026-08-11",
  dueDate: "2026-08-27",
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
});
