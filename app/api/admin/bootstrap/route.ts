import { NextResponse } from "next/server";
import { getAdminBootstrap } from "@/lib/server/admin-data";
import { apiError, requireApiUser } from "@/lib/server/http";
import { e2eAdminBootstrap } from "@/lib/test-support/e2e-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.E2E_TEST_MODE === "1") return NextResponse.json(e2eAdminBootstrap);
  try {
    const user = await requireApiUser();
    return NextResponse.json({ user, data: await getAdminBootstrap(user) });
  } catch (error) {
    return apiError(error);
  }
}
