import { PermissionKey, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { productFormulas } from "@/lib/domain/product-formulas";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { apiError, ApiError, requireApiUser } from "@/lib/server/http";
import { assertTrustedOrigin, requestContext } from "@/lib/server/security";
import { updateProductSchema } from "@/lib/validation/admin-product";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser(PermissionKey.MANAGE_PRICING);
    const { id } = await context.params;
    const data = updateProductSchema.parse(await request.json());
    const formula = productFormulas[data.formulaKey];
    const requestMeta = requestContext(request);

    const [product, duplicate] = await Promise.all([
      db.productType.findUnique({ where: { id } }),
      db.productType.findFirst({ where: { code: data.code, id: { not: id } }, select: { id: true } }),
    ]);
    if (!product || !product.active) throw new ApiError(404, "Изделие не найдено");
    if (duplicate) throw new ApiError(409, "Изделие с таким кодом уже существует");

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.productType.update({
        where: { id },
        data: {
          code: data.code,
          name: data.name,
          category: data.category,
          description: formula.label,
          imagePath: formula.imagePath,
          defaultDimensions: formula.defaultDimensions as Prisma.InputJsonObject,
          calculationMethod: formula.calculationMethod,
        },
      });
      await writeAudit({
        actorId: user.id,
        action: "UPDATE",
        entityType: "ProductType",
        entityId: result.id,
        before: { code: product.code, name: product.name, category: product.category },
        after: data,
        ...requestMeta,
      }, tx);
      return result;
    });

    return NextResponse.json({ id: updated.id, ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser(PermissionKey.MANAGE_PRICING);
    const { id } = await context.params;
    const requestMeta = requestContext(request);

    const [product, activeCount] = await Promise.all([
      db.productType.findUnique({ where: { id } }),
      db.productType.count({ where: { active: true, code: { not: "custom" } } }),
    ]);
    if (!product || !product.active) throw new ApiError(404, "Изделие не найдено");
    if (activeCount <= 1) throw new ApiError(409, "Нельзя удалить последнее изделие из калькулятора");

    await db.$transaction(async (tx) => {
      await tx.productType.update({ where: { id }, data: { active: false } });
      await writeAudit({
        actorId: user.id,
        action: "DELETE",
        entityType: "ProductType",
        entityId: product.id,
        before: { code: product.code, name: product.name, category: product.category, active: product.active },
        after: { active: false },
        ...requestMeta,
      }, tx);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
