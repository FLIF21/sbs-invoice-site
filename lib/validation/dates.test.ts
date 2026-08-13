import { describe, expect, it } from "vitest";
import { dueDateValidationError, invoiceDateError, isCanonicalDate, minimumDueDate, nextDate } from "./dates";

describe("invoiceDateError", () => {
  const today = "2026-08-13";

  it("rejects 2026-08-12 for an invoice dated 2026-08-13", () => {
    expect(invoiceDateError("2026-08-13", "2026-08-12", today))
      .toBe("Дата готовности не может быть раньше даты счёта");
  });

  it("accepts the invoice date and later canonical dates", () => {
    expect(dueDateValidationError("2026-08-13", "2026-08-13", today)).toBe("");
    expect(dueDateValidationError("2026-08-13", "2026-08-20", today)).toBe("");
  });

  it("updates the minimum from the canonical invoice date", () => {
    expect(minimumDueDate("2026-08-13", today)).toBe("2026-08-13");
    expect(minimumDueDate("2026-08-20", today)).toBe("2026-08-20");
  });

  it("increments dates without UTC conversion", () => {
    expect(nextDate("2026-08-31")).toBe("2026-09-01");
    expect(nextDate("2028-02-28")).toBe("2028-02-29");
    expect(isCanonicalDate("2026-02-30")).toBe(false);
  });
});
