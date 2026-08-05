import "server-only";
import { Prisma, type Invoice, type InvoiceItem } from "@prisma/client";
import { calculateQuote, formatInvoiceNumber } from "@/lib/domain/pricing";
import type { InvoiceDocument, InvoiceClientData } from "@/lib/domain/types";
import type { InvoiceInput } from "@/lib/validation/invoice";
import { writeAudit } from "./audit";
import { getPublicCatalog } from "./catalog";
import { db } from "./db";

type RequestActor = {
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

async function takeInvoiceNumber(tx: Prisma.TransactionClient, now: Date) {
  const setting = await tx.invoiceNumberSetting.findUniqueOrThrow({ where: { id: "default" } });
  const year = now.getFullYear();
  const shouldReset = setting.resetYearly && setting.lastYear !== year;
  const value = shouldReset ? 1 : setting.nextValue;
  const number = formatInvoiceNumber(setting.pattern, value, year);
  await tx.invoiceNumberSetting.update({
    where: { id: "default" },
    data: { nextValue: value + 1, lastYear: year },
  });
  return number;
}

function nullable(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function clientJson(client: InvoiceClientData): Prisma.InputJsonObject {
  return {
    name: client.name,
    inn: client.inn ?? "",
    kpp: client.kpp ?? "",
    address: client.address ?? "",
    phone: client.phone ?? "",
    email: client.email ?? "",
  };
}

export async function createInvoice(input: InvoiceInput, actor: RequestActor = {}) {
  const catalog = await getPublicCatalog();
  const quote = calculateQuote(input.items, catalog);
  const now = input.issueDate ? new Date(`${input.issueDate}T12:00:00.000Z`) : new Date();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const invoice = await db.$transaction(async (tx) => {
        const number = await takeInvoiceNumber(tx, now);
        const clientData = {
          name: input.client.name,
          inn: nullable(input.client.inn),
          kpp: nullable(input.client.kpp),
          address: nullable(input.client.address),
          phone: nullable(input.client.phone),
          email: nullable(input.client.email),
        };
        const client = clientData.inn
          ? await tx.client.upsert({
            where: { inn: clientData.inn },
            update: clientData,
            create: clientData,
          })
          : await tx.client.create({ data: clientData });

        const created = await tx.invoice.create({
          data: {
            number,
            issueDate: now,
            dueDate: input.dueDate ? new Date(`${input.dueDate}T12:00:00.000Z`) : null,
            project: nullable(input.project),
            requestNumber: nullable(input.requestNumber),
            applicant: nullable(input.applicant),
            notes: nullable(input.notes),
            clientId: client.id,
            createdById: actor.userId,
            subtotal: quote.subtotal,
            taxAmount: quote.taxAmount,
            total: quote.total,
            clientSnapshot: clientJson(input.client),
            companySnapshot: catalog.company as unknown as Prisma.InputJsonObject,
            taxSnapshot: quote.tax as unknown as Prisma.InputJsonObject,
            pricingSnapshot: {
              pricesUpdatedAt: catalog.pricesUpdatedAt,
              coefficients: catalog.coefficients as unknown as Prisma.InputJsonArray,
              lines: quote.lines.map((line) => line.pricingSnapshot) as Prisma.InputJsonArray,
            },
            items: {
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
          include: { items: { orderBy: { position: "asc" } } },
        });
        await writeAudit({
          actorId: actor.userId,
          action: "CREATE",
          entityType: "Invoice",
          entityId: created.id,
          after: { number: created.number, total: created.total.toString() },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        }, tx);
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return serializeInvoice(invoice);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  throw new Error("Не удалось зарезервировать номер счёта");
}

type InvoiceWithItems = Invoice & { items: InvoiceItem[] };

export function serializeInvoice(invoice: InvoiceWithItems): InvoiceDocument {
  const company = invoice.companySnapshot as unknown as InvoiceDocument["company"];
  const client = invoice.clientSnapshot as unknown as InvoiceDocument["client"];
  const tax = invoice.taxSnapshot as unknown as InvoiceDocument["tax"];
  const multiplier = tax.enabled ? 1 + tax.rate / 100 : 1;
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    issueDate: invoice.issueDate.toISOString(),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    project: invoice.project,
    requestNumber: invoice.requestNumber,
    applicant: invoice.applicant,
    notes: invoice.notes,
    subtotal: invoice.subtotal.toNumber(),
    taxAmount: invoice.taxAmount.toNumber(),
    total: invoice.total.toNumber(),
    tax,
    company,
    client,
    items: invoice.items.map((item) => ({
      productId: item.productTypeId ?? "",
      productCode: item.productCodeSnapshot,
      productName: item.description.split(" ")[0] ?? item.productCodeSnapshot,
      description: item.description,
      dimensions: item.dimensions as InvoiceDocument["items"][number]["dimensions"],
      thicknessCode: item.thicknessCode,
      quantity: item.quantity.toNumber(),
      area: item.area.toNumber(),
      netUnitPrice: item.unitPrice.toNumber(),
      grossUnitPrice: item.unitPrice.toNumber() * multiplier,
      netTotal: item.total.toNumber(),
      grossTotal: item.total.toNumber() * multiplier,
      pricingSnapshot: {},
    })),
  };
}

export async function getInvoiceDocument(id: string) {
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: { items: { orderBy: { position: "asc" } } },
  });
  return invoice ? serializeInvoice(invoice) : null;
}
