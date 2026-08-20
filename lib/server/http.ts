import "server-only";
import { PermissionKey } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { formatValidationIssue } from "@/lib/validation/issues";
import { QuoteInputError } from "@/lib/domain/pricing";
import { getCurrentUser } from "./auth";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireApiUser(permission?: PermissionKey) {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "Требуется вход");
  if (permission && !user.permissions.includes(permission)) throw new ApiError(403, "Недостаточно прав");
  return user;
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof QuoteInputError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof ZodError) {
    const details = error.issues[0] ? formatValidationIssue(error.issues[0]) : "Проверьте заполнение полей";
    return NextResponse.json({ error: details, issues: error.issues }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "Внутренняя ошибка";
  const safe = process.env.NODE_ENV === "development" ? message : "Не удалось выполнить операцию";
  return NextResponse.json({ error: safe }, { status: 500 });
}
