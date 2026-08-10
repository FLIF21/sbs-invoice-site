import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { sendPasswordResetEmail } from "@/lib/server/email";
import { apiError, ApiError } from "@/lib/server/http";
import { createPasswordResetToken } from "@/lib/server/password-reset";
import { assertTrustedOrigin, checkRateLimit, requestContext } from "@/lib/server/security";

const requestSchema = z.object({
  email: z.email().transform((value) => value.trim().toLowerCase()),
});

const successMessage = "Если пользователь с таким email существует, письмо уже отправлено";

function opaqueIdentifier(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const { email } = requestSchema.parse(await request.json());
    const context = requestContext(request);
    try {
      await Promise.all([
        checkRateLimit(`password-reset:ip:${opaqueIdentifier(context.ipAddress)}`, 5, 15 * 60),
        checkRateLimit(`password-reset:email:${opaqueIdentifier(email)}`, 3, 15 * 60),
      ]);
    } catch {
      throw new ApiError(429, "Слишком много запросов. Повторите через 15 минут");
    }

    const user = await db.user.findUnique({ where: { email } });
    if (user?.active) {
      const token = await createPasswordResetToken(user.id, context.ipAddress);
      try {
        await sendPasswordResetEmail({ email: user.email, name: user.name, token });
      } catch (error) {
        console.error("Password reset email delivery failed", error);
      }
    }

    return NextResponse.json({ ok: true, message: successMessage });
  } catch (error) {
    return apiError(error);
  }
}
