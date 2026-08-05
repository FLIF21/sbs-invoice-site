import { NextRequest, NextResponse } from "next/server";
import { createInvoice } from "@/lib/server/invoices";
import { apiError } from "@/lib/server/http";
import { assertTrustedOrigin, checkRateLimit, requestContext } from "@/lib/server/security";
import { invoiceInputSchema } from "@/lib/validation/invoice";
import { getCurrentUser } from "@/lib/server/auth";

export async function POST(request: NextRequest) {
  try {
    assertTrustedOrigin(request);
    const context = requestContext(request);
    await checkRateLimit(`invoice:${context.ipAddress}`, 20, 60 * 60);
    const input = invoiceInputSchema.parse(await request.json());
    const user = await getCurrentUser();
    const invoice = await createInvoice(input, { userId: user?.id, ...context });
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
