import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  BACKUP_SECRET: z.string().min(32),
  APP_URL: z.url(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
});

export function getEnv() {
  return schema.parse(process.env);
}
