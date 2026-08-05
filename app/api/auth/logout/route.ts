import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { apiError } from "@/lib/server/http";
import { assertTrustedOrigin } from "@/lib/server/security";

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (token) {
      const session = await verifySessionToken(token).catch(() => null);
      if (session) await db.authSession.update({ where: { jti: session.jti }, data: { revokedAt: new Date() } });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return apiError(error);
  }
}
