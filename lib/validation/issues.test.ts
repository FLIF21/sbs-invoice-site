import { describe, expect, it } from "vitest";
import { formatValidationIssue } from "./issues";

describe("formatValidationIssue", () => {
  it("указывает номер позиции и название ошибочного поля", () => {
    expect(formatValidationIssue({
      path: ["items", 4, "quantity"],
      message: "не должно превышать 1 000 000 000",
    })).toBe("Позиция 5, Количество: не должно превышать 1 000 000 000");
  });
});
