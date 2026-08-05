import { InvoiceStatus, PermissionKey, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calculateQuote } from "@/lib/domain/pricing";
import { writeAudit } from "@/lib/server/audit";
import { getPublicCatalog } from "@/lib/server/catalog";
import { db } from "@/lib/server/db";
import { apiError, ApiError, requireApiUser } from "@/lib/server/http";
import { getInvoiceDocument } from "@/lib/server/invoices";
import { assertTrustedOrigin, requestContext } from "@/lib/server/security";
import { quoteItemSchema } from "@/lib/validation/invoice";

const updateSchema = z.object({
  status: z.enum(InvoiceStatus),
  project: z.string().trim().max(1_000),
  requestNumber: z.string().trim().max(1_000),
  applicant: z.string().trim().max(1_000),
  dueDate: z.union([z.iso.date(), z.literal("")]),
  notes: z.string().trim().max(2_000),
  client: z.object({
    name: z.string().trim().min(2).max(500), inn: z.string().trim().max(20), kpp: z.string().trim().max(20),
    address: z.string().trim().max(1_000), phone: z.string().trim().max(100), email: z.union([z.email(), z.literal("")]),
  }),
  items: z.array(quoteItemSchema).min(1).max(100),
});

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireApiUser(PermissionKey.VIEW_INVOICES);
    const invoice = await getInvoiceDocument((await context.params).id);
    if (!invoice) throw new ApiError(404, "Счёт не найден");
    return NextResponse.json(invoice);
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(request);
    const actor = await requireApiUser(PermissionKey.EDIT_INVOICES);
    const { id } = await context.params;
    const input = updateSchema.parse(await request.json());
    const before = await db.invoice.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Счёт не найден");
    const catalog = await getPublicCatalog();
    const quote = calculateQuote(input.items, catalog);
    const clientSnapshot = input.client as unknown as Prisma.InputJsonObject;
    await db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          status: input.status,
          project: input.project || null,
          requestNumber: input.requestNumber || null,
          applicant: input.applicant || null,
          dueDate: input.dueDate ? new Date(`${input.dueDate}T12:00:00.000Z`) : null,
          notes: input.notes || null,
          clientSnapshot,
          companySnapshot: catalog.company as unknown as Prisma.InputJsonObject,
          taxSnapshot: quote.tax as unknown as Prisma.InputJsonObject,
          pricingSnapshot: {
            pricesUpdatedAt: catalog.pricesUpdatedAt,
            coefficients: catalog.coefficients as unknown as Prisma.InputJsonArray,
            lines: quote.lines.map((line) => line.pricingSnapshot) as Prisma.InputJsonArray,
          },
          subtotal: quote.subtotal,
          taxAmount: quote.taxAmount,
          total: quote.total,
          items: {
            deleteMany: {},
            create: quote.lines.map((line, index) => ({
              position: index + 1,
              productTypeId: line.productId,
              productCodeSnapshot: line.productCode,
              description: line.description,
              dimensions: line.dimensions as Prisma.InputJsonObject,
              thicknessCode: line.thicknessCode,
              quantity: line.quantity,
              area: line.area,
              unitPrice: line.netUnitPrice,
              total: line.netTotal,
            })),
          },
        },
      });
      if (before.clientId) await tx.client.update({ where: { id: before.clientId }, data: { ...input.client, inn: input.client.inn || null, kpp: input.client.kpp || null, address: input.client.address || null, phone: input.client.phone || null, email: input.client.email || null } });
      await writeAudit({ actorId: actor.id, action: "UPDATE", entityType: "Invoice", entityId: id, before: { status: before.status, project: before.project, requestNumber: before.requestNumber, total: before.total.toString() }, after: { status: input.status, project: input.project, requestNumber: input.requestNumber, total: quote.total, items: quote.lines.length }, ...requestContext(request) }, tx);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(request);
    const actor = await requireApiUser(PermissionKey.DELETE_INVOICES);
    const { id } = await context.params;
    const before = await db.invoice.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Счёт не найден");
    await db.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { status: InvoiceStatus.CANCELLED } });
      await writeAudit({ actorId: actor.id, action: "CANCEL", entityType: "Invoice", entityId: id, before: { status: before.status }, after: { status: InvoiceStatus.CANCELLED }, ...requestContext(request) }, tx);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
