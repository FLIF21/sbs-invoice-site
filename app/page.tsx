import { Calculator } from "@/components/calculator/Calculator";
import { getPublicCatalog } from "@/lib/server/catalog";

export const dynamic = "force-dynamic";

export default async function Home() {
  const catalog = await getPublicCatalog();
  return <Calculator initialCatalog={catalog} />;
}
