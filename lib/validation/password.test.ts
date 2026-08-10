import { describe, expect, it } from "vitest";
import { strongPasswordSchema } from "./password";

describe("strongPasswordSchema", () => {
  it("accepts a password with sufficient length, uppercase letters and digits", () => {
    expect(strongPasswordSchema.safeParse("SecureInvoice2026").success).toBe(true);
  });

  it.each([
    "Short1",
    "alllowercase2026",
    "NOLOWERCASE2026",
    "NoDigitsInPassword",
  ])("rejects weak password %s", (password) => {
    expect(strongPasswordSchema.safeParse(password).success).toBe(false);
  });
});
