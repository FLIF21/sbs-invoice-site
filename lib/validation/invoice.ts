import { z } from "zod";
import { invoiceDateError, todayInMoscow } from "./dates";
import { MAX_ANGLE_VALUE, MAX_DIMENSION_VALUE, MAX_INVOICE_ITEM_QUANTITY } from "./numeric-input";

const optionalText = z.string().trim().max(1_000).optional().default("");
const dimension = z.number().finite().positive().max(MAX_DIMENSION_VALUE).optional();

// The database column has decimal capacity, but a public invoice quantity is a
// count of finished pieces and therefore must be an integer.
export { MAX_INVOICE_ITEM_QUANTITY };

export const quoteItemSchema = z.object({
  productCode: z.string().trim().min(1).max(80),
  thicknessCode: z.string().trim().min(1).max(20),
  quantity: z.number().finite().int({ message: "должно быть целым числом" }).min(1, {
    message: "должно быть не меньше 1",
  }).max(MAX_INVOICE_ITEM_QUANTITY, {
    message: "не должно превышать 1 000 000 000",
  }),
  dimensions: z.object({
    width: dimension,
    height: dimension,
    width2: dimension,
    height2: dimension,
    diameter: dimension,
    length: dimension,
    radius: dimension,
    angle: z.number().finite().positive().max(MAX_ANGLE_VALUE).optional(),
    area: dimension,
    rail: z.string().trim().max(30).optional(),
  }),
});

export const invoiceInputSchema = z.object({
  idempotencyKey: z.uuid(),
  issueDate: z.iso.date().optional(),
  dueDate: z.union([z.iso.date(), z.literal("")]).optional(),
  project: optionalText,
  requestNumber: optionalText,
  applicant: optionalText,
  notes: optionalText,
  client: z.object({
    name: z.string().trim().min(2).max(500),
    inn: z.string().trim().max(20).optional().default(""),
    kpp: z.string().trim().max(20).optional().default(""),
    address: z.string().trim().max(1_000).optional().default(""),
    phone: z.string().trim().max(100).optional().default(""),
    email: z.union([z.email(), z.literal("")]).optional().default(""),
  }),
  items: z.array(quoteItemSchema).min(1).max(100),
}).superRefine((value, context) => {
  const error = invoiceDateError(value.issueDate ?? todayInMoscow(), value.dueDate ?? "");
  if (!error) return;
  context.addIssue({
    code: "custom",
    path: [error.startsWith("Дата готовности") ? "dueDate" : "issueDate"],
    message: error,
  });
});

export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
