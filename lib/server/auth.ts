import "server-only";
import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";
import { getEnv } from "./env";
import { resolvedPermissions } from "./permissions";

export const SESSION_COOKIE = "sbs_session";

function secret() {
  return new TextEncoder().encode(getEnv().JWT_SECRET);
}

export async function createSessionToken(
  user: { id: string; tokenVersion: number },
  context: { ipAddress?: string | null; userAgent?: string | null },
) {
  const env = getEnv();
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1_000);
  await db.authSession.create({
    data: { jti, userId: user.id, expiresAt, ipAddress: context.ipAddress, userAgent: context.userAgent },
  });
  const token = await new SignJWT({ ver: user.tokenVersion })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setJti(jti)
    .setIssuer("sbs-invoice")
    .setAudience("sbs-admin")
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());
  return { token, expiresAt };
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, secret(), {
    issuer: "sbs-invoice",
    audience: "sbs-admin",
    algorithms: ["HS256"],
  });
  if (!payload.sub || !payload.jti || typeof payload.ver !== "number") throw new Error("Некорректная сессия");
  const session = await db.authSession.findUnique({
    where: { jti: payload.jti },
    include: { user: { include: { permissions: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.active) return null;
  if (session.user.tokenVersion !== payload.ver || session.user.id !== payload.sub) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    permissions: resolvedPermissions(session.user),
    jti: session.jti,
  };
}

export async function getCurrentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
