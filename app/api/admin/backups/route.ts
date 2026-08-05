import { BackupStatus, PermissionKey } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/server/audit";
import { backupChecksum, createBackupPayload, recordBackup, restoreBackupPayload } from "@/lib/server/backup";
import { db } from "@/lib/server/db";
import { apiError, ApiError, requireApiUser } from "@/lib/server/http";
import { assertTrustedOrigin, requestContext } from "@/lib/server/security";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(PermissionKey.MANAGE_BACKUPS);
    const payload = await createBackupPayload();
    const stamp = new Date().toISOString().replaceAll(":", "-").replace("T", "_").slice(0, 19);
    const fileName = `sbs-backup_${stamp}.sbsbak`;
    await recordBackup(fileName, payload, user.id);
    await writeAudit({ actorId: user.id, action: "CREATE", entityType: "Backup", after: { fileName, checksum: backupChecksum(payload), size: payload.length }, ...requestContext(request) });
    return new NextResponse(payload, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const user = await requireApiUser(PermissionKey.MANAGE_BACKUPS);
    const payload = Buffer.from(await request.arrayBuffer());
    if (!payload.length || payload.length > 100 * 1024 * 1024) throw new ApiError(400, "Некорректный размер файла");
    const checksum = backupChecksum(payload);
    try {
      await restoreBackupPayload(payload);
    } catch (error) {
      await db.backupRecord.create({ data: { fileName: "restore-failed.sbsbak", checksum, size: payload.length, createdById: user.id, status: BackupStatus.FAILED } }).catch(() => null);
      throw error;
    }
    const restoredActor = await db.user.findUnique({ where: { id: user.id }, select: { id: true } });
    await db.backupRecord.create({ data: { fileName: "restored.sbsbak", checksum, size: payload.length, createdById: restoredActor?.id, status: BackupStatus.RESTORED } });
    await writeAudit({ actorId: restoredActor?.id, action: "RESTORE", entityType: "Backup", after: { checksum, size: payload.length }, ...requestContext(request) });
    const response = NextResponse.json({ ok: true, message: "Копия восстановлена. Войдите снова" });
    response.cookies.set("sbs_session", "", { path: "/", maxAge: 0, httpOnly: true });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
