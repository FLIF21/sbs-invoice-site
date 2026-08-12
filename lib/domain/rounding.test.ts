import { describe, expect, it } from "vitest";
import { grossMoney, roundMoney, sumMoney, taxMoney } from "./rounding";

describe("money rounding", () => {
  it("округляет денежные границы до копеек без двоичного артефакта", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(10.075)).toBe(10.08);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });

  it("считает НДС от округлённой суммы и сохраняет точное равенство итогов", () => {
    expect(taxMoney(2_373.92, 22)).toBe(522.26);
    expect(grossMoney(2_373.92, 22)).toBe(2_896.18);
  });
});
