import { PermissionKey, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { formatInvoiceNumber } from "@/lib/domain/pricing";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { apiError, ApiError, requireApiUser } from "@/lib/server/http";
import { assertTrustedOrigin, requestContext } from "@/lib/server/security";

const sectionPermissions = {
  pricing: PermissionKey.MANAGE_PRICING,
  metal: PermissionKey.MANAGE_METAL,
  coefficients: PermissionKey.MANAGE_COEFFICIENTS,
  tax: PermissionKey.MANAGE_TAX,
  company: PermissionKey.MANAGE_COMPANY,
  numbering: PermissionKey.MANAGE_NUMBERING,
} as const;

const money = z.number().finite().min(0).max(1_000_000_000);

const schemas = {
  pricing: z.object({ rows: z.array(z.object({ id: z.string(), targetGrossRate: money, materialMultiplier: z.number().finite().min(0).max(1_000) })).min(1) }),
  metal: z.object({ rows: z.array(z.object({ id: z.string(), costPerSquareMeter: money })).min(1) }),
  coefficients: z.object({ rows: z.array(z.object({ id: z.string(), value: z.number().finite().min(0).max(1_000), enabled: z.boolean() })).min(1) }),
  tax: z.object({ enabled: z.boolean(), rate: z.number().finite().min(0).max(100) }),
  company: z.object({
    name: z.string().trim().min(1).max(200), legalName: z.string().trim().min(1).max(300), inn: z.string().trim().max(20),
    kpp: z.string().trim().max(20), ogrn: z.string().trim().max(30), bankName: z.string().trim().max(300), bik: z.string().trim().max(20),
    checking: z.string().trim().max(40), correspondent: z.string().trim().max(40), address: z.string().trim().max(1_000),
    phone: z.string().trim().max(100), email: z.union([z.email(), z.literal("")]), website: z.string().trim().max(300),
  }),
  numbering: z.object({ pattern: z.string().trim().min(1).max(100), nextValue: z.number().int().min(1).max(2_000_000_000), resetYearly: z.boolean() }),
};

const nullIfEmpty = (value: string) => value || null;

export async function PUT(request: NextRequest, context: { params: Promise<{ section: string }> }) {
  try {
    assertTrustedOrigin(request);
    const { section } = await context.params;
    if (!(section in sectionPermissions)) throw new ApiError(404, "Раздел не найден");
    const key = section as keyof typeof sectionPermissions;
    const user = await requireApiUser(sectionPermissions[key]);
    const payload = schemas[key].parse(await request.json()) as never;
    const requestMeta = requestContext(request);

    if (key === "metal") {
      const data = payload as z.infer<typeof schemas.metal>;
      const before = await db.metalPrice.findMany({ where: { thicknessId: { in: data.rows.map((row) => row.id) } } });
      await db.$transaction(async (tx) => {
        for (const row of data.rows) await tx.metalPrice.update({ where: { thicknessId: row.id }, data: { costPerSquareMeter: row.costPerSquareMeter } });
        await writeAudit({ actorId: user.id, action: "UPDATE", entityType: "MetalPrice", before: before.map((row) => ({ thicknessId: row.thicknessId, value: row.costPerSquareMeter.toString() })), after: data.rows, ...requestMeta }, tx);
      });
    } else if (key === "coefficients") {
      const data = payload as z.infer<typeof schemas.coefficients>;
      const before = await db.coefficient.findMany({ where: { id: { in: data.rows.map((row) => row.id) } } });
      await db.$transaction(async (tx) => {
        for (const row of data.rows) await tx.coefficient.update({ where: { id: row.id }, data: { value: row.value, enabled: row.enabled } });
        await writeAudit({ actorId: user.id, action: "UPDATE", entityType: "Coefficient", before: before.map((row) => ({ id: row.id, value: row.value.toString(), enabled: row.enabled })), after: data.rows, ...requestMeta }, tx);
      });
    } else if (key === "tax") {
      const data = payload as z.infer<typeof schemas.tax>;
      const before = await db.taxSetting.findUniqueOrThrow({ where: { id: "default" } });
      const after = await db.taxSetting.update({ where: { id: "default" }, data });
      await writeAudit({ actorId: user.id, action: "UPDATE", entityType: "TaxSetting", entityId: "default", before: { enabled: before.enabled, rate: before.rate.toString() }, after: { enabled: after.enabled, rate: after.rate.toString() }, ...requestMeta });
    } else if (key === "company") {
      const data = payload as z.infer<typeof schemas.company>;
      const before = await db.companyProfile.findUniqueOrThrow({ where: { id: "default" } });
      const after = await db.companyProfile.update({
        where: { id: "default" },
        data: { ...data, inn: nullIfEmpty(data.inn), kpp: nullIfEmpty(data.kpp), ogrn: nullIfEmpty(data.ogrn), bankName: nullIfEmpty(data.bankName), bik: nullIfEmpty(data.bik), checking: nullIfEmpty(data.checking), correspondent: nullIfEmpty(data.correspondent), address: nullIfEmpty(data.address), phone: nullIfEmpty(data.phone), email: nullIfEmpty(data.email), website: nullIfEmpty(data.website) },
      });
      await writeAudit({ actorId: user.id, action: "UPDATE", entityType: "CompanyProfile", entityId: "default", before: { legalName: before.legalName, inn: before.inn }, after: { legalName: after.legalName, inn: after.inn }, ...requestMeta });
    } else if (key === "numbering") {
      const data = payload as z.infer<typeof schemas.numbering>;
      formatInvoiceNumber(data.pattern, data.nextValue, new Date().getFullYear());
      const before = await db.invoiceNumberSetting.findUniqueOrThrow({ where: { id: "default" } });
      const after = await db.invoiceNumberSetting.update({ where: { id: "default" }, data });
      await writeAudit({ actorId: user.id, action: "UPDATE", entityType: "InvoiceNumberSetting", entityId: "default", before: { pattern: before.pattern, nextValue: before.nextValue, resetYearly: before.resetYearly }, after: { pattern: after.pattern, nextValue: after.nextValue, resetYearly: after.resetYearly }, ...requestMeta });
    } else if (key === "pricing") {
      const data = payload as z.infer<typeof schemas.pricing>;
      const [rates, coefficients, tax] = await Promise.all([
        db.productRate.findMany({ where: { id: { in: data.rows.map((row) => row.id) } }, include: { thickness: { include: { metalPrice: true } } } }),
        db.coefficient.findMany({ where: { enabled: true } }),
        db.taxSetting.findUniqueOrThrow({ where: { id: "default" } }),
      ]);
      const coefficient = coefficients.reduce((value, item) => value * item.value.toNumber(), 1);
      const taxMultiplier = tax.enabled ? 1 + tax.rate.toNumber() / 100 : 1;
      await db.$transaction(async (tx) => {
        for (const row of data.rows) {
          const current = rates.find((rate) => rate.id === row.id);
          if (!current) throw new ApiError(404, "Строка прайса не найдена");
          const metal = current.thickness.metalPrice?.costPerSquareMeter.toNumber() ?? 0;
          const targetBase = row.targetGrossRate / taxMultiplier / coefficient;
          const laborCost = targetBase - metal * row.materialMultiplier;
          if (laborCost < 0) throw new ApiError(400, "Целевая цена ниже стоимости металла");
          await tx.productRate.update({ where: { id: row.id }, data: { materialMultiplier: row.materialMultiplier, laborCost: new Prisma.Decimal(laborCost) } });
        }
        await writeAudit({ actorId: user.id, action: "UPDATE", entityType: "ProductRate", before: rates.map((rate) => ({ id: rate.id, materialMultiplier: rate.materialMultiplier.toString(), laborCost: rate.laborCost.toString() })), after: data.rows, ...requestMeta }, tx);
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
