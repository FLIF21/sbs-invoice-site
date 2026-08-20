import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/server/http";
import { createInvoicePayment } from "@/lib/server/payments";
import { assertTrustedOrigin, checkRateLimit, requestContext } from "@/lib/server/security";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(request);
    const requestData = requestContext(request);
    await checkRateLimit(`payment-create:${requestData.ipAddress}`, 10, 60 * 60);
    return NextResponse.json(await createInvoicePayment((await context.params).id));
  } catch (error) {
    return apiError(error);
  }
}
