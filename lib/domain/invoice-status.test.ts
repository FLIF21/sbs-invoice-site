import { describe, expect, it } from "vitest";
import { invoiceStatusLabel, invoiceStatusLabels } from "./invoice-status";

describe("invoiceStatusLabel", () => {
  it("переводит все статусы счёта на русский язык", () => {
    expect(invoiceStatusLabels).toEqual({
      DRAFT: "Черновик",
      ISSUED: "Выставлен",
      PAID: "Оплачен",
      CANCELLED: "Отменён",
    });
  });

  it("безопасно показывает неизвестный статус как есть", () => {
    expect(invoiceStatusLabel("UNKNOWN")).toBe("UNKNOWN");
  });
});
