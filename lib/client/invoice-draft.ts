import { z } from "zod";
import type { InvoiceDocument, ProductDimensions, PublicCatalog } from "../domain/types";

export const INVOICE_DRAFT_STORAGE_KEY = "sbs-invoice-draft-v1";
export const INVOICE_DRAFT_VERSION = 1;

export type NumericValue = number | string;
export type EditableDimensions = Omit<ProductDimensions, "width" | "height" | "width2" | "height2" | "diameter" | "length" | "radius" | "angle" | "area"> & {
  width?: NumericValue;
  height?: NumericValue;
  width2?: NumericValue;
  height2?: NumericValue;
  diameter?: NumericValue;
  length?: NumericValue;
  radius?: NumericValue;
  angle?: NumericValue;
  area?: NumericValue;
};
export type EditableItem = { id: number; productCode: string; thicknessCode: string; quantity: NumericValue; dimensions: EditableDimensions };
export type ClientDetails = { name: string; inn: string; kpp: string; address: string; phone: string; email: string };
export type InvoiceMeta = { issueDate: string; dueDate: string; project: string; requestNumber: string; applicant: string; notes: string };

export type InvoiceDraft = {
  version: typeof INVOICE_DRAFT_VERSION;
  updatedAt: string;
  idempotencyKey: string;
  meta: InvoiceMeta;
  client: ClientDetails;
  items: EditableItem[];
  savedInvoice: InvoiceDocument | null;
};

const numericValue = z.union([z.number().finite(), z.string().regex(/^\d*(?:\.\d*)?$/)]);
const dimensionsSchema = z.object({
  width: numericValue.optional(), height: numericValue.optional(), width2: numericValue.optional(), height2: numericValue.optional(),
  diameter: numericValue.optional(), length: numericValue.optional(), radius: numericValue.optional(), angle: numericValue.optional(),
  area: numericValue.optional(), rail: z.string().max(30).optional(),
});
const editableItemSchema = z.object({
  id: z.number().int().positive(), productCode: z.string().min(1).max(80), thicknessCode: z.string().min(1).max(20),
  quantity: numericValue, dimensions: dimensionsSchema,
});
const metaSchema = z.object({
  issueDate: z.string(), dueDate: z.string(), project: z.string(), requestNumber: z.string(), applicant: z.string(), notes: z.string(),
});
const clientSchema = z.object({
  name: z.string(), inn: z.string(), kpp: z.string(), address: z.string(), phone: z.string(), email: z.string(),
});
const savedInvoiceSchema = z.custom<InvoiceDocument>((value) => {
  if (!value || typeof value !== "object") return false;
  const invoice = value as Partial<InvoiceDocument>;
  return typeof invoice.id === "string" && typeof invoice.number === "string" && typeof invoice.issueDate === "string"
    && typeof invoice.total === "number" && Array.isArray(invoice.items) && Boolean(invoice.company) && Boolean(invoice.client);
});
const draftSchema = z.object({
  version: z.literal(INVOICE_DRAFT_VERSION),
  updatedAt: z.iso.datetime(),
  idempotencyKey: z.uuid(),
  meta: metaSchema,
  client: clientSchema,
  items: z.array(editableItemSchema).min(1).max(100),
  savedInvoice: savedInvoiceSchema.nullable(),
});

export function newIdempotencyKey() {
  return crypto.randomUUID();
}

export function parseInvoiceDraft(raw: string | null, catalog: PublicCatalog): InvoiceDraft | null {
  if (!raw) return null;
  try {
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const productCodes = new Set(catalog.products.map((product) => product.code));
    const thicknessCodes = new Set(catalog.thicknesses.map((thickness) => thickness.code));
    if (parsed.data.items.some((item) => !productCodes.has(item.productCode) || !thicknessCodes.has(item.thicknessCode))) return null;
    if (new Set(parsed.data.items.map((item) => item.id)).size !== parsed.data.items.length) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function serializeInvoiceDraft(draft: Omit<InvoiceDraft, "version" | "updatedAt">) {
  return JSON.stringify({ ...draft, version: INVOICE_DRAFT_VERSION, updatedAt: new Date().toISOString() });
}

export function isMeaningfulDraft(meta: InvoiceMeta, client: ClientDetails, items: EditableItem[], defaultItem: EditableItem, savedInvoice: InvoiceDocument | null) {
  if (savedInvoice) return true;
  if (Object.values(client).some((value) => value.trim())) return true;
  if ([meta.dueDate, meta.project, meta.requestNumber, meta.applicant, meta.notes].some((value) => value.trim())) return true;
  return items.length !== 1 || JSON.stringify(items[0]) !== JSON.stringify(defaultItem);
}
