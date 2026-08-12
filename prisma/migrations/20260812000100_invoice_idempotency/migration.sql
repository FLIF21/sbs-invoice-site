ALTER TABLE "Invoice" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "idempotencyHash" TEXT;

CREATE UNIQUE INDEX "Invoice_idempotencyKey_key" ON "Invoice"("idempotencyKey");
