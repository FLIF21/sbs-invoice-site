import { describe, expect, it } from "vitest";
import { createProductSchema, updateProductSchema } from "./admin-product";

const validProduct = {
  code: "ductExtra",
  name: "Воздуховод усиленный",
  category: "Воздуховоды",
  formulaKey: "rectangular-duct",
  rates: [{ thicknessId: "thickness-05", targetGrossRate: 1_000, materialMultiplier: 1 }],
};

describe("createProductSchema", () => {
  it("принимает изделие с формулой и положительной ценой", () => {
    expect(createProductSchema.parse(validProduct)).toMatchObject(validProduct);
  });

  it("отклоняет кириллический код и нулевую цену", () => {
    expect(createProductSchema.safeParse({ ...validProduct, code: "воздуховод" }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...validProduct, rates: [{ ...validProduct.rates[0], targetGrossRate: 0 }] }).success).toBe(false);
  });

  it("отклоняет повтор одной толщины", () => {
    const result = createProductSchema.safeParse({ ...validProduct, rates: [validProduct.rates[0], validProduct.rates[0]] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]).toMatchObject({ path: ["rates"], message: "Толщина не должна повторяться" });
  });

  it("проверяет редактируемые реквизиты изделия без массива цен", () => {
    const details = { code: validProduct.code, name: "Воздуховод обновлённый", category: validProduct.category, formulaKey: validProduct.formulaKey };
    expect(updateProductSchema.parse(details)).toEqual(details);
    expect(updateProductSchema.safeParse({ ...details, name: "" }).success).toBe(false);
  });
});
