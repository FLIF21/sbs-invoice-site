import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/server/http";
import { synchronizeYooKassaPayment } from "@/lib/server/payments";

const notificationSchema = z.object({
  event: z.enum(["payment.succeeded", "payment.canceled", "payment.waiting_for_capture"]),
  object: z.object({ id: z.string().min(1) }).passthrough(),
}).passthrough();

export async function POST(request: NextRequest) {
  try {
    const notification = notificationSchema.parse(await request.json());
    await synchronizeYooKassaPayment(notification.object.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
