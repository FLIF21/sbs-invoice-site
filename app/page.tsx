import { Calculator } from "@/components/calculator/Calculator";
import { getPublicCatalog } from "@/lib/server/catalog";
import { getPublicPaymentConfig } from "@/lib/server/payments";
import { e2eCatalog } from "@/lib/test-support/e2e-catalog";

export const dynamic = "force-dynamic";

export default async function Home() {
  const catalog = process.env.E2E_TEST_MODE === "1" ? e2eCatalog : await getPublicCatalog();
  return <Calculator initialCatalog={catalog} paymentConfig={getPublicPaymentConfig()} />;
}
