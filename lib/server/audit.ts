import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "./db";

type AuditClient = PrismaClient | Prisma.TransactionClient;

export async function writeAudit(
  input: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
  client: AuditClient = db,
) {
  return client.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before,
      after: input.after,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
  });
}
