import { hash } from "bcryptjs";
import { PermissionKey, UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { apiError, ApiError, requireApiUser } from "@/lib/server/http";
import { assertTrustedOrigin, requestContext } from "@/lib/server/security";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.union([z.string().min(12).max(500), z.literal("")]).optional(),
  role: z.enum(UserRole),
  active: z.boolean(),
  permissions: z.array(z.enum(PermissionKey)),
});

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(request);
    const actor = await requireApiUser(PermissionKey.MANAGE_USERS);
    const { id } = await context.params;
    const input = updateSchema.parse(await request.json());
    const before = await db.user.findUnique({ where: { id }, include: { permissions: true } });
    if (!before) throw new ApiError(404, "Пользователь не найден");
    if (before.role === UserRole.ADMIN && (!input.active || input.role !== UserRole.ADMIN)) {
      const admins = await db.user.count({ where: { role: UserRole.ADMIN, active: true } });
      if (admins <= 1) throw new ApiError(400, "Нельзя отключить последнего администратора");
    }
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          name: input.name,
          email: input.email,
          role: input.role,
          active: input.active,
          ...(input.password ? { passwordHash: await hash(input.password, 12), tokenVersion: { increment: 1 } } : {}),
        },
      });
      await tx.userPermission.deleteMany({ where: { userId: id } });
      await tx.userPermission.createMany({
        data: Object.values(PermissionKey).map((permission) => ({ userId: id, permission, allowed: input.permissions.includes(permission) })),
      });
      if (!input.active) await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await writeAudit({ actorId: actor.id, action: "UPDATE", entityType: "User", entityId: id, before: { name: before.name, email: before.email, role: before.role, active: before.active }, after: { name: input.name, email: input.email, role: input.role, active: input.active, permissions: input.permissions }, ...requestContext(request) }, tx);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(request);
    const actor = await requireApiUser(PermissionKey.MANAGE_USERS);
    const { id } = await context.params;
    if (id === actor.id) throw new ApiError(400, "Нельзя отключить собственную учётную запись");
    const target = await db.user.findUnique({ where: { id } });
    if (!target) throw new ApiError(404, "Пользователь не найден");
    if (target.role === UserRole.ADMIN) {
      const admins = await db.user.count({ where: { role: UserRole.ADMIN, active: true } });
      if (admins <= 1) throw new ApiError(400, "Нельзя отключить последнего администратора");
    }
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { active: false, tokenVersion: { increment: 1 } } });
      await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await writeAudit({ actorId: actor.id, action: "DISABLE", entityType: "User", entityId: id, before: { active: target.active }, after: { active: false }, ...requestContext(request) }, tx);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
