import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const failedMigration = "20260811000100_add_round_transition";

try {
  const removed = await db.$executeRaw`
    DELETE FROM "_prisma_migrations"
    WHERE "migration_name" = ${failedMigration}
      AND "finished_at" IS NULL
  `;
  if (removed > 0) console.log(`Removed failed migration record: ${failedMigration}`);
} finally {
  await db.$disconnect();
}
