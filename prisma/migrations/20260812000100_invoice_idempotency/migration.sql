ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "idempotencyHash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_idempotencyKey_key" ON "Invoice"("idempotencyKey");
