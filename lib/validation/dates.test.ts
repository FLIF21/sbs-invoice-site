import { describe, expect, it } from "vitest";
import { invoiceDateError } from "./dates";

describe("invoiceDateError", () => {
  const today = "2026-08-13";

  it("rejects a due date earlier than the invoice date", () => {
    expect(invoiceDateError("2026-08-20", "2026-08-19", today))
      .toBe("Дата готовности не может быть раньше даты счёта");
  });

  it("accepts the invoice date itself as the due date", () => {
    expect(invoiceDateError("2026-08-20", "2026-08-20", today)).toBe("");
  });
});
