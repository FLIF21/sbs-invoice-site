import { describe, expect, it } from "vitest";
import { parsePositiveDecimal, parsePositiveInteger } from "./numeric-input";

describe("numeric input", () => {
  it("одинаково принимает десятичную запятую и точку", () => {
    expect(parsePositiveDecimal("400,5", "Размер")).toEqual({ success: true, value: 400.5 });
    expect(parsePositiveDecimal("400.5", "Размер")).toEqual({ success: true, value: 400.5 });
  });

  it.each(["-1", "0", "NaN", "Infinity"])("отклоняет недопустимый размер %s", (value) => {
    const result = parsePositiveDecimal(value, "Размер");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/положительное|больше нуля/);
  });

  it("отклоняет дробное количество и принимает целое не меньше 1", () => {
    expect(parsePositiveInteger("1,5")).toMatchObject({ success: false, error: expect.stringContaining("целое число") });
    expect(parsePositiveInteger("1")).toEqual({ success: true, value: 1 });
  });
});
