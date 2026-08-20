import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/server/http";
import { completeTestPayment } from "@/lib/server/payments";
import { assertTrustedOrigin, checkRateLimit, requestContext } from "@/lib/server/security";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(request);
    const requestData = requestContext(request);
    await checkRateLimit(`payment-test:${requestData.ipAddress}`, 20, 60 * 60);
    const invoiceId = await completeTestPayment((await context.params).id);
    return NextResponse.json({ returnUrl: `/?payment=test-return&invoice=${encodeURIComponent(invoiceId)}` });
  } catch (error) {
    return apiError(error);
  }
}
