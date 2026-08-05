import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { BackupStatus, Prisma, UserRole } from "@prisma/client";
import { db } from "./db";
import { getEnv } from "./env";

const magic = Buffer.from("SBSBK1");

function encryptionKey() {
  return createHash("sha256").update(getEnv().BACKUP_SECRET).digest();
}

export async function createBackupPayload() {
  const [users, permissions, thicknesses, metalPrices, products, rates, coefficients, tax, company, numbering, clients, invoices, items, auditLogs, systemSettings] = await Promise.all([
    db.user.findMany(), db.userPermission.findMany(), db.thickness.findMany(), db.metalPrice.findMany(), db.productType.findMany(),
    db.productRate.findMany(), db.coefficient.findMany(), db.taxSetting.findMany(), db.companyProfile.findMany(), db.invoiceNumberSetting.findMany(),
    db.client.findMany(), db.invoice.findMany(), db.invoiceItem.findMany(), db.auditLog.findMany(), db.systemSetting.findMany(),
  ]);
  const data = {
    version: 1,
    createdAt: new Date().toISOString(),
    tables: {
      users,
      permissions,
      thicknesses,
      metalPrices,
      products,
      rates,
      coefficients,
      tax,
      company: company.map((item) => ({ ...item, logo: item.logo ? Buffer.from(item.logo).toString("base64") : null })),
      numbering,
      clients,
      invoices,
      items,
      auditLogs,
      systemSettings,
    },
  };
  const clear = Buffer.from(JSON.stringify(data), "utf8");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(clear), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([magic, iv, tag, encrypted]);
}

function decryptBackup(payload: Buffer) {
  if (payload.subarray(0, magic.length).compare(magic) !== 0) throw new Error("Неверный формат резервной копии");
  const iv = payload.subarray(magic.length, magic.length + 12);
  const tag = payload.subarray(magic.length + 12, magic.length + 28);
  const encrypted = payload.subarray(magic.length + 28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")) as {
    version: number;
    tables: Record<string, Array<Record<string, unknown>>>;
  };
}

const dates = <T extends Record<string, unknown>>(row: T, keys: string[]) => {
  const result: Record<string, unknown> = { ...row };
  keys.forEach((key) => { if (typeof result[key] === "string") result[key] = new Date(result[key] as string); });
  return result;
};

export async function restoreBackupPayload(payload: Buffer) {
  const backup = decryptBackup(payload);
  if (backup.version !== 1 || !backup.tables) throw new Error("Версия резервной копии не поддерживается");
  const tables = backup.tables;
  const users = tables.users ?? [];
  if (!users.some((user) => user.role === UserRole.ADMIN && user.active === true)) throw new Error("В копии нет активного администратора");

  await db.$transaction(async (tx) => {
    await tx.authSession.deleteMany();
    await tx.loginAttempt.deleteMany();
    await tx.rateLimitBucket.deleteMany();
    await tx.userPermission.deleteMany();
    await tx.auditLog.deleteMany();
    await tx.invoiceItem.deleteMany();
    await tx.invoice.deleteMany();
    await tx.client.deleteMany();
    await tx.productRate.deleteMany();
    await tx.metalPrice.deleteMany();
    await tx.thickness.deleteMany();
    await tx.productType.deleteMany();
    await tx.coefficient.deleteMany();
    await tx.taxSetting.deleteMany();
    await tx.companyProfile.deleteMany();
    await tx.invoiceNumberSetting.deleteMany();
    await tx.systemSetting.deleteMany();
    await tx.backupRecord.deleteMany();
    await tx.user.deleteMany();

    if (users.length) await tx.user.createMany({ data: users.map((row) => dates(row, ["createdAt", "updatedAt"])) as never });
    if (tables.permissions?.length) await tx.userPermission.createMany({ data: tables.permissions as never });
    if (tables.thicknesses?.length) await tx.thickness.createMany({ data: tables.thicknesses.map((row) => dates(row, ["createdAt", "updatedAt"])) as never });
    if (tables.metalPrices?.length) await tx.metalPrice.createMany({ data: tables.metalPrices.map((row) => dates(row, ["createdAt", "updatedAt"])) as never });
    if (tables.products?.length) await tx.productType.createMany({ data: tables.products.map((row) => dates(row, ["createdAt", "updatedAt"])) as never });
    if (tables.rates?.length) await tx.productRate.createMany({ data: tables.rates.map((row) => dates(row, ["createdAt", "updatedAt"])) as never });
    if (tables.coefficients?.length) await tx.coefficient.createMany({ data: tables.coefficients.map((row) => dates(row, ["createdAt", "updatedAt"])) as never });
    if (tables.tax?.length) await tx.taxSetting.createMany({ data: tables.tax.map((row) => dates(row, ["createdAt", "updatedAt"])) as never });
    if (tables.company?.length) await tx.companyProfile.createMany({ data: tables.company.map((row) => {
      const item = dates(row, ["createdAt", "updatedAt"]);
      return { ...item, logo: typeof item.logo === "string" ? Buffer.from(item.logo, "base64") : null };
    }) as never });
    if (tables.numbering?.length) await tx.invoiceNumberSetting.createMany({ data: tables.numbering.map((row) => dates(row, ["createdAt", "updatedAt"])) as never });
    if (tables.clients?.length) await tx.client.createMany({ data: tables.clients.map((row) => dates(row, ["createdAt", "updatedAt"])) as never });
    if (tables.invoices?.length) await tx.invoice.createMany({ data: tables.invoices.map((row) => dates(row, ["issueDate", "dueDate", "createdAt", "updatedAt"])) as never });
    if (tables.items?.length) await tx.invoiceItem.createMany({ data: tables.items as never });
    if (tables.auditLogs?.length) await tx.auditLog.createMany({ data: tables.auditLogs.map((row) => dates(row, ["createdAt"])) as never });
    if (tables.systemSettings?.length) await tx.systemSetting.createMany({ data: tables.systemSettings.map((row) => dates(row, ["createdAt", "updatedAt"])) as never });
  }, { maxWait: 10_000, timeout: 120_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function backupChecksum(payload: Buffer) {
  return createHash("sha256").update(payload).digest("hex");
}

export async function recordBackup(fileName: string, payload: Buffer, createdById: string, status = BackupStatus.CREATED) {
  return db.backupRecord.create({ data: { fileName, checksum: backupChecksum(payload), size: payload.length, createdById, status } });
}
