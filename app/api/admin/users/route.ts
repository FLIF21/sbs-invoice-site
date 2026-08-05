import { hash } from "bcryptjs";
import { PermissionKey, UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { apiError, requireApiUser } from "@/lib/server/http";
import { assertTrustedOrigin, requestContext } from "@/lib/server/security";

const userSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12).max(500),
  role: z.enum(UserRole),
  active: z.boolean().default(true),
  permissions: z.array(z.enum(PermissionKey)).default([]),
});

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const actor = await requireApiUser(PermissionKey.MANAGE_USERS);
    const input = userSchema.parse(await request.json());
    const created = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: input.name, email: input.email, passwordHash: await hash(input.password, 12), role: input.role, active: input.active },
      });
      await tx.userPermission.createMany({
        data: Object.values(PermissionKey).map((permission) => ({ userId: user.id, permission, allowed: input.permissions.includes(permission) })),
      });
      await writeAudit({ actorId: actor.id, action: "CREATE", entityType: "User", entityId: user.id, after: { name: user.name, email: user.email, role: user.role, permissions: input.permissions }, ...requestContext(request) }, tx);
      return user;
    });
    return NextResponse.json({ id: created.id }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
