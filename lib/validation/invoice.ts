import { z } from "zod";

const optionalText = z.string().trim().max(1_000).optional().default("");
const dimension = z.number().finite().positive().max(1_000_000).optional();

// The database stores quantity as Decimal(18,3). This guard stays well inside
// that boundary while allowing large production batches.
export const MAX_INVOICE_ITEM_QUANTITY = 1_000_000_000;

export const quoteItemSchema = z.object({
  productCode: z.string().trim().min(1).max(80),
  thicknessCode: z.string().trim().min(1).max(20),
  quantity: z.number().finite().positive().max(MAX_INVOICE_ITEM_QUANTITY, {
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
    angle: z.number().finite().positive().max(360).optional(),
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
});

export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
