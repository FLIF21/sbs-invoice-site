import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const recoverableMigrations = [
  "20260811000100_add_round_transition",
  "20260812000100_invoice_idempotency",
];

try {
  for (const migration of recoverableMigrations) {
    const removed = await db.$executeRaw`
      DELETE FROM "_prisma_migrations"
      WHERE "migration_name" = ${migration}
        AND "finished_at" IS NULL
    `;
    if (removed > 0) console.log(`Removed failed migration record: ${migration}`);
  }
} finally {
  await db.$disconnect();
}
