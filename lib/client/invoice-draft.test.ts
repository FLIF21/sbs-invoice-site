import { describe, expect, it } from "vitest";
import type { PublicCatalog } from "../domain/types";
import { INVOICE_DRAFT_VERSION, parseInvoiceDraft, serializeInvoiceDraft } from "./invoice-draft";

const catalog = {
  products: [{ code: "duct" }],
  thicknesses: [{ code: "0.5" }],
} as PublicCatalog;

const draft = {
  idempotencyKey: "6f5769dc-5c8b-4f1f-a39e-6b2c16af5084",
  meta: { issueDate: "2026-08-12", dueDate: "2026-08-20", project: "Проект", requestNumber: "42", applicant: "Павел", notes: "" },
  client: { name: "ООО Покупатель", inn: "123", kpp: "456", address: "Длинный адрес", phone: "+7", email: "mail@example.com" },
  items: [{ id: 1, productCode: "duct", thicknessCode: "0.5", quantity: "2", dimensions: { width: "400", height: "250", length: "1500", rail: "20/20" } }],
  savedInvoice: null,
};

describe("invoice draft storage", () => {
  it("восстанавливает все поля и устойчивый ключ запроса", () => {
    const restored = parseInvoiceDraft(serializeInvoiceDraft(draft), catalog);
    expect(restored).toMatchObject({ version: INVOICE_DRAFT_VERSION, ...draft });
  });

  it("безопасно отклоняет повреждённый или несовместимый черновик", () => {
    expect(parseInvoiceDraft("{broken", catalog)).toBeNull();
    const incompatible = { ...draft, items: [{ ...draft.items[0], productCode: "removed" }] };
    expect(parseInvoiceDraft(serializeInvoiceDraft(incompatible), catalog)).toBeNull();
  });
});
