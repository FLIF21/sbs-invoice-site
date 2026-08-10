import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) return undefined;
  const url = new URL(value);
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "3");
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "10");
  if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "10");
  return url.toString();
}

export const db = globalForPrisma.prisma ?? new PrismaClient({
  datasourceUrl: databaseUrl(),
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
});

globalForPrisma.prisma = db;
