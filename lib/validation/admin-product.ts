import { z } from "zod";
import { productFormulaKeys } from "../domain/product-formulas";

const rateSchema = z.object({
  thicknessId: z.string().min(1),
  targetGrossRate: z.number().finite().positive().max(1_000_000_000),
  materialMultiplier: z.number().finite().min(0).max(1_000),
});

export const createProductSchema = z.object({
  code: z.string().trim().min(2).max(80).regex(/^[A-Za-z][A-Za-z0-9_-]*$/, {
    message: "Код должен начинаться с латинской буквы и содержать только латинские буквы, цифры, _ или -",
  }),
  name: z.string().trim().min(2).max(200),
  category: z.string().trim().min(2).max(200),
  formulaKey: z.enum(productFormulaKeys),
  rates: z.array(rateSchema).min(1),
}).superRefine((value, context) => {
  const ids = value.rates.map((rate) => rate.thicknessId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["rates"], message: "Толщина не должна повторяться" });
});
