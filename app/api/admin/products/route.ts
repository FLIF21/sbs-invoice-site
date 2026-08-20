import { PermissionKey, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { productFormulas } from "@/lib/domain/product-formulas";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { apiError, ApiError, requireApiUser } from "@/lib/server/http";
import { assertTrustedOrigin, requestContext } from "@/lib/server/security";
import { createProductSchema } from "@/lib/validation/admin-product";

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser(PermissionKey.MANAGE_PRICING);
    const data = createProductSchema.parse(await request.json());
    const formula = productFormulas[data.formulaKey];
    const requestMeta = requestContext(request);

    const [existing, thicknesses, coefficients, tax, lastProduct] = await Promise.all([
      db.productType.findUnique({ where: { code: data.code } }),
      db.thickness.findMany({ where: { active: true }, include: { metalPrice: true }, orderBy: { sortOrder: "asc" } }),
      db.coefficient.findMany({ where: { enabled: true } }),
      db.taxSetting.findUniqueOrThrow({ where: { id: "default" } }),
      db.productType.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } }),
    ]);
    if (existing) throw new ApiError(409, "Изделие с таким кодом уже существует");

    const configuredIds = new Set(data.rates.map((rate) => rate.thicknessId));
    if (thicknesses.some((thickness) => !configuredIds.has(thickness.id)) || configuredIds.size !== thicknesses.length) {
      throw new ApiError(400, "Укажите цену для каждой доступной толщины");
    }

    const coefficient = coefficients.reduce((value, item) => value * item.value.toNumber(), 1);
    const taxMultiplier = tax.enabled ? 1 + tax.rate.toNumber() / 100 : 1;
    if (coefficient <= 0 || taxMultiplier <= 0) throw new ApiError(400, "Проверьте коэффициенты и настройку НДС");

    const rates = data.rates.map((rate) => {
      const thickness = thicknesses.find((item) => item.id === rate.thicknessId)!;
      const metal = thickness.metalPrice?.costPerSquareMeter.toNumber() ?? 0;
      const targetBase = rate.targetGrossRate / taxMultiplier / coefficient;
      const laborCost = targetBase - metal * rate.materialMultiplier;
      if (laborCost < 0) throw new ApiError(400, `Цена для толщины ${thickness.label} ниже стоимости металла`);
      return { ...rate, laborCost };
    });

    const product = await db.$transaction(async (tx) => {
      const created = await tx.productType.create({
        data: {
          code: data.code,
          name: data.name,
          category: data.category,
          description: formula.label,
          imagePath: formula.imagePath,
          defaultDimensions: formula.defaultDimensions as Prisma.InputJsonObject,
          calculationMethod: formula.calculationMethod,
          sortOrder: (lastProduct?.sortOrder ?? 0) + 10,
          rates: {
            create: rates.map((rate) => ({
              thicknessId: rate.thicknessId,
              tierKey: "default",
              materialMultiplier: rate.materialMultiplier,
              laborCost: new Prisma.Decimal(rate.laborCost),
            })),
          },
        },
      });
      await writeAudit({
        actorId: user.id,
        action: "CREATE",
        entityType: "ProductType",
        entityId: created.id,
        after: { code: created.code, name: created.name, formulaKey: data.formulaKey, rates: data.rates },
        ...requestMeta,
      }, tx);
      return created;
    });

    return NextResponse.json({ id: product.id, ok: true }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
