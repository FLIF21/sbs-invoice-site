import { PermissionKey } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { apiError, ApiError, requireApiUser } from "@/lib/server/http";
import { assertTrustedOrigin, requestContext } from "@/lib/server/security";

const schema = z.object({
  name: z.string().trim().min(2).max(500), inn: z.string().trim().max(20), kpp: z.string().trim().max(20),
  address: z.string().trim().max(1_000), phone: z.string().trim().max(100), email: z.union([z.email(), z.literal("")]),
});

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(request);
    const actor = await requireApiUser(PermissionKey.MANAGE_CLIENTS);
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    const before = await db.client.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, "Клиент не найден");
    await db.$transaction(async (tx) => {
      await tx.client.update({ where: { id }, data: { ...input, inn: input.inn || null, kpp: input.kpp || null, address: input.address || null, phone: input.phone || null, email: input.email || null } });
      await writeAudit({ actorId: actor.id, action: "UPDATE", entityType: "Client", entityId: id, before: { name: before.name, inn: before.inn }, after: input, ...requestContext(request) }, tx);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
