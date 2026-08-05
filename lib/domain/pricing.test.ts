import { describe, expect, it } from "vitest";
import { calculateQuote, formatInvoiceNumber } from "./pricing";
import type { PublicCatalog } from "./types";

const catalog: PublicCatalog = {
  products: [{
    id: "duct-id",
    code: "duct",
    name: "Воздуховод",
    category: "Воздуховоды",
    description: null,
    imagePath: null,
    defaultDimensions: { width: 400, height: 250, length: 1500, rail: "20/20" },
    calculationMethod: "RECTANGULAR_DUCT",
    rates: [{ id: "rate-id", thicknessCode: "0.5", tierKey: "default", minBoundary: null, maxBoundary: null, materialMultiplier: 1, laborCost: 258.6967 }],
  }],
  thicknesses: [{ id: "thickness-id", code: "0.5", millimeters: 0.5, label: "0,5 мм", metalCost: 350 }],
  coefficients: [{ id: "coefficient-id", key: "manufacturing", name: "Изготовление", value: 1, enabled: true }],
  tax: { enabled: true, rate: 22 },
  company: { name: "СБС", legalName: "ООО", inn: null, kpp: null, ogrn: null, bankName: null, bik: null, checking: null, correspondent: null, address: null, phone: null, email: null, website: null },
  invoiceNumberPreview: "000001",
  pricesUpdatedAt: new Date(0).toISOString(),
};

describe("calculateQuote", () => {
  it("считает площадь воздуховода и добавляет настраиваемый НДС", () => {
    const quote = calculateQuote([{ productCode: "duct", thicknessCode: "0.5", quantity: 2, dimensions: { width: 400, height: 250, length: 1500, rail: "20/20" } }], catalog);
    expect(quote.lines[0].area).toBe(3.9);
    expect(quote.lines[0].grossUnitPrice).toBeCloseTo(742.61, 2);
    expect(quote.total).toBeCloseTo(2896.18, 2);
    expect(quote.subtotal + quote.taxAmount).toBeCloseTo(quote.total, 2);
  });

  it("не начисляет налог, когда НДС отключён", () => {
    const quote = calculateQuote([{ productCode: "duct", thicknessCode: "0.5", quantity: 1, dimensions: { width: 400, height: 250, length: 1500 } }], { ...catalog, tax: { enabled: false, rate: 25 } });
    expect(quote.taxAmount).toBe(0);
    expect(quote.total).toBe(quote.subtotal);
  });
});

describe("formatInvoiceNumber", () => {
  it("поддерживает год, префикс и длину номера", () => {
    expect(formatInvoiceNumber("{YEAR}-{NUMBER:4}", 7, 2026)).toBe("2026-0007");
    expect(formatInvoiceNumber("СБС-{NUMBER:5}", 12, 2026)).toBe("СБС-00012");
  });

  it("отклоняет шаблон без счётчика", () => {
    expect(() => formatInvoiceNumber("СБС", 1, 2026)).toThrow(/NUMBER/);
  });
});
