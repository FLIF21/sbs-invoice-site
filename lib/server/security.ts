import "server-only";
import type { NextRequest } from "next/server";
import { db } from "./db";
import { getEnv } from "./env";

export function requestContext(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwarded || request.headers.get("x-real-ip") || "unknown",
    userAgent: request.headers.get("user-agent")?.slice(0, 500) || null,
  };
}

export function assertTrustedOrigin(request: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (!origin) throw new Error("Запрос без Origin отклонён");
  const configuredOrigin = new URL(getEnv().APP_URL).origin;
  const requestOrigin = new URL(request.url).origin;
  if (origin !== configuredOrigin && origin !== requestOrigin) throw new Error("Недоверенный источник запроса");
}

export async function isLoginBlocked(identifier: string, ipAddress: string) {
  const since = new Date(Date.now() - 15 * 60 * 1_000);
  const [byIdentifier, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { successful: false, createdAt: { gte: since }, identifier } }),
    db.loginAttempt.count({ where: { successful: false, createdAt: { gte: since }, ipAddress } }),
  ]);
  return byIdentifier >= 5 || byIp >= 25;
}

export async function recordLogin(identifier: string, ipAddress: string, successful: boolean) {
  if (successful) await db.loginAttempt.deleteMany({ where: { identifier, successful: false } });
  await db.loginAttempt.create({ data: { identifier, ipAddress, successful } });
}

export async function checkRateLimit(key: string, limit: number, windowSeconds: number) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowSeconds * 1_000);
  const bucket = await db.$transaction(async (tx) => {
    const current = await tx.rateLimitBucket.findUnique({ where: { key } });
    if (!current || current.expiresAt <= now) {
      return tx.rateLimitBucket.upsert({
        where: { key },
        update: { count: 1, windowStart: now, expiresAt },
        create: { key, count: 1, windowStart: now, expiresAt },
      });
    }
    return tx.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
  });
  if (bucket.count > limit) throw new Error("Слишком много запросов. Повторите позже");
}
