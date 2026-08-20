import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/server/http";
import { getPublicInvoicePaymentStatus } from "@/lib/server/payments";
import { checkRateLimit, requestContext } from "@/lib/server/security";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const requestData = requestContext(request);
    await checkRateLimit(`payment-status:${requestData.ipAddress}`, 60, 60 * 60);
    return NextResponse.json(await getPublicInvoicePaymentStatus((await context.params).id));
  } catch (error) {
    return apiError(error);
  }
}
