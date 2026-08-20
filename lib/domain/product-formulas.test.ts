import { describe, expect, it } from "vitest";
import { calculateArea } from "./pricing";
import { productFormulaKey, productFormulas } from "./product-formulas";

describe("productFormulas", () => {
  it("каждый шаблон использует существующий расчёт площади", () => {
    for (const formula of Object.values(productFormulas)) {
      const area = calculateArea(formula.calculationMethod, formula.defaultDimensions, 1);
      expect(area, formula.key).toBeGreaterThan(0);
    }
  });

  it("различает прямоугольный и круглый варианты перехода", () => {
    expect(productFormulaKey("RECTANGULAR_TRANSITION", productFormulas["rectangular-transition"].defaultDimensions)).toBe("rectangular-transition");
    expect(productFormulaKey("RECTANGULAR_TRANSITION", productFormulas["round-transition"].defaultDimensions)).toBe("round-transition");
  });
});
