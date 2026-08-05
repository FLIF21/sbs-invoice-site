import { NextResponse } from "next/server";
import { getAdminBootstrap } from "@/lib/server/admin-data";
import { apiError, requireApiUser } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireApiUser();
    return NextResponse.json({ user, data: await getAdminBootstrap(user) });
  } catch (error) {
    return apiError(error);
  }
}
