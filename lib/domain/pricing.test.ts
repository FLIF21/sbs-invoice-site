import { describe, expect, it } from "vitest";
import { calculateArea, calculateQuote, formatInvoiceNumber } from "./pricing";
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

describe("calculateArea", () => {
  it("использует длину 1500 мм для воздуховода, если L не указана", () => {
    expect(calculateArea("RECTANGULAR_DUCT", { width: 400, height: 250 }, 1)).toBe(1.95);
  });

  it("считает прямоугольный отвод по средней линии радиуса", () => {
    expect(calculateArea("RECTANGULAR_ELBOW", { width: 400, height: 250, radius: 100, angle: 90 }, 1)).toBe(0.6126);
  });

  it("считает переход прямоугольный → прямоугольный по наклонной длине", () => {
    expect(calculateArea("RECTANGULAR_TRANSITION", { width: 400, height: 250, width2: 300, height2: 200, length: 1000 }, 1)).toBe(1.1518);
  });

  it("считает переход прямоугольный → круглый по наклонной длине", () => {
    expect(calculateArea("RECTANGULAR_TO_ROUND_TRANSITION", { width: 400, height: 250, diameter: 300, length: 1000 }, 1)).toBe(1.1239);
  });

  it("считает круглый дроссель как цилиндр и один торец", () => {
    expect(calculateArea("ROUND_DAMPER", { width: 300, length: 300 }, 1)).toBe(0.3534);
  });

  it("считает прямоугольный дроссель как боковую поверхность и одну сторону", () => {
    expect(calculateArea("RECTANGULAR_DAMPER", { width: 400, height: 250, length: 300 }, 1)).toBe(0.49);
  });

  it("умножает площадь единицы на количество", () => {
    expect(calculateArea("RECTANGULAR_DUCT", { width: 400, height: 250, length: 1500 }, 3)).toBe(5.85);
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
