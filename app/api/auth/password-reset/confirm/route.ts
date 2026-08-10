import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ApiError } from "@/lib/server/http";
import { resetPassword } from "@/lib/server/password-reset";
import { assertTrustedOrigin, checkRateLimit, requestContext } from "@/lib/server/security";
import { strongPasswordSchema } from "@/lib/validation/password";

const confirmSchema = z.object({
  token: z.string().min(32).max(200),
  password: strongPasswordSchema,
});

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const input = confirmSchema.parse(await request.json());
    const context = requestContext(request);
    try {
      await checkRateLimit(`password-reset-confirm:${context.ipAddress}`, 10, 15 * 60);
    } catch {
      throw new ApiError(429, "Слишком много попыток. Повторите позже");
    }
    await resetPassword(input.token, input.password, context);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
