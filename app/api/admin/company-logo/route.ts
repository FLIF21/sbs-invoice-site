import { PermissionKey } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { apiError, ApiError, requireApiUser } from "@/lib/server/http";
import { assertTrustedOrigin, requestContext } from "@/lib/server/security";

const accepted = new Set(["image/png", "image/jpeg"]);

export async function PUT(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser(PermissionKey.MANAGE_COMPANY);
    const form = await request.formData();
    const file = form.get("logo");
    if (!(file instanceof File)) throw new ApiError(400, "Выберите файл логотипа");
    if (!accepted.has(file.type)) throw new ApiError(400, "Допустимы PNG и JPEG");
    if (file.size > 2 * 1024 * 1024) throw new ApiError(400, "Логотип должен быть меньше 2 МБ");
    await db.companyProfile.update({ where: { id: "default" }, data: { logo: Buffer.from(await file.arrayBuffer()), logoMimeType: file.type } });
    await writeAudit({ actorId: user.id, action: "UPDATE_LOGO", entityType: "CompanyProfile", entityId: "default", after: { mimeType: file.type, size: file.size }, ...requestContext(request) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
