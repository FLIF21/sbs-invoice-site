import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { db } from "./db";
import { ApiError } from "./http";

const RESET_TTL_MS = 30 * 60 * 1_000;

export function passwordResetTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetToken(userId: string, requestedIp: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await db.$transaction([
    db.passwordResetToken.deleteMany({ where: { OR: [{ userId }, { expiresAt: { lte: new Date() } }] } }),
    db.passwordResetToken.create({
      data: { userId, tokenHash: passwordResetTokenHash(token), expiresAt, requestedIp },
    }),
  ]);
  return token;
}

export async function resetPassword(token: string, password: string, context: { ipAddress?: string | null; userAgent?: string | null }) {
  const tokenHash = passwordResetTokenHash(token);
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw new ApiError(400, "Ссылка недействительна или срок её действия истёк");
  }

  const passwordHash = await hash(password, 12);
  const now = new Date();
  await db.$transaction(async (transaction) => {
    const claimed = await transaction.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new ApiError(400, "Ссылка уже была использована");
    await transaction.user.update({
      where: { id: record.userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await transaction.authSession.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await transaction.auditLog.create({
      data: {
        action: "PASSWORD_RESET",
        entityType: "User",
        entityId: record.userId,
        after: { resetAt: now.toISOString() },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  });
}
