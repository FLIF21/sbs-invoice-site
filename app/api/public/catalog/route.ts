import { NextResponse } from "next/server";
import { getPublicCatalog } from "@/lib/server/catalog";
import { apiError } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getPublicCatalog());
  } catch (error) {
    return apiError(error);
  }
}
