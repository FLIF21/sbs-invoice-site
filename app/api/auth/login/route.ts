import { compare } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { apiError, ApiError } from "@/lib/server/http";
import { assertTrustedOrigin, isLoginBlocked, recordLogin, requestContext } from "@/lib/server/security";

const loginSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(1).max(500),
});

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const credentials = loginSchema.parse(await request.json());
    const context = requestContext(request);
    if (await isLoginBlocked(credentials.email, context.ipAddress)) {
      throw new ApiError(429, "Слишком много попыток. Повторите через 15 минут");
    }
    const user = await db.user.findUnique({ where: { email: credentials.email } });
    const valid = user?.active && await compare(credentials.password, user.passwordHash);
    await recordLogin(credentials.email, context.ipAddress, Boolean(valid));
    if (!user || !valid) throw new ApiError(401, "Неверный email или пароль");

    const session = await createSessionToken(user, context);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    return response;
  } catch (error) {
    return apiError(error);
  }
}
