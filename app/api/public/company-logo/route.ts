import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { apiError } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const company = await db.companyProfile.findUnique({ where: { id: "default" }, select: { logo: true, logoMimeType: true } });
    if (!company?.logo) return new NextResponse(null, { status: 404 });
    return new NextResponse(company.logo, {
      headers: {
        "Content-Type": company.logoMimeType ?? "image/png",
        "Cache-Control": "public, max-age=300, must-revalidate",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
