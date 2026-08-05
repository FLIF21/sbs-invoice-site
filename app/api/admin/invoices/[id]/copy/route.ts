import { PermissionKey } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError, ApiError, requireApiUser } from "@/lib/server/http";
import { createInvoice, getInvoiceDocument } from "@/lib/server/invoices";
import { assertTrustedOrigin, requestContext } from "@/lib/server/security";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertTrustedOrigin(request);
    const actor = await requireApiUser(PermissionKey.CREATE_INVOICES);
    const original = await getInvoiceDocument((await context.params).id);
    if (!original) throw new ApiError(404, "Счёт не найден");
    const copy = await createInvoice({
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: "",
      project: original.project ?? "",
      requestNumber: original.requestNumber ?? "",
      applicant: original.applicant ?? "",
      notes: `Копия счёта № ${original.number}`,
      client: {
        name: original.client.name,
        inn: original.client.inn ?? "",
        kpp: original.client.kpp ?? "",
        address: original.client.address ?? "",
        phone: original.client.phone ?? "",
        email: original.client.email ?? "",
      },
      items: original.items.map((item) => ({ productCode: item.productCode, thicknessCode: item.thicknessCode, quantity: item.quantity, dimensions: item.dimensions })),
    }, { userId: actor.id, ...requestContext(request) });
    return NextResponse.json(copy, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
