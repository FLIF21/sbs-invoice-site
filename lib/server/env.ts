import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  BACKUP_SECRET: z.string().min(32),
  APP_URL: z.url(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM: z.email().optional(),
});

export function getEnv() {
  return schema.parse(process.env);
}

export function getMailEnv() {
  const env = getEnv();
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD || !env.SMTP_FROM) {
    throw new Error("SMTP не настроен: задайте SMTP_HOST, SMTP_USER, SMTP_PASSWORD и SMTP_FROM");
  }
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from: env.SMTP_FROM,
    appUrl: env.APP_URL,
  };
}
