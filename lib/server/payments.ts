import "server-only";

import { randomUUID } from "node:crypto";
import { InvoiceStatus, PaymentProvider, PaymentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import type { PaymentCreationResult, PaymentPublicConfig } from "@/lib/domain/types";
import { isConfirmedSuccessfulPayment, paymentMatchesInvoice } from "@/lib/domain/payment-verification";
import { writeAudit } from "./audit";
import { db } from "./db";
import { getEnv } from "./env";
import { ApiError } from "./http";

const yooKassaPaymentSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["pending", "waiting_for_capture", "succeeded", "canceled"]),
  paid: z.boolean(),
  amount: z.object({ value: z.string(), currency: z.string() }),
  confirmation: z.object({ confirmation_url: z.url().optional() }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

type PaymentConfiguration =
  | { provider: "disabled"; testMode: false }
  | { provider: "test"; testMode: true; appUrl: string }
  | { provider: "yookassa"; testMode: boolean; appUrl: string; shopId: string; secretKey: string };

export function getPaymentConfiguration(): PaymentConfiguration {
  const requested = process.env.PAYMENT_PROVIDER
    ?? (process.env.NODE_ENV === "development" || process.env.E2E_TEST_MODE === "1" ? "test" : "disabled");
  if (requested === "test") {
    return process.env.NODE_ENV === "production" && process.env.E2E_TEST_MODE !== "1"
      ? { provider: "disabled", testMode: false }
      : { provider: "test", testMode: true, appUrl: process.env.APP_URL ?? process.env.E2E_BASE_URL ?? "http://localhost:3000" };
  }
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (requested === "yookassa" && shopId && secretKey) {
    const env = getEnv();
    return {
      provider: "yookassa",
      testMode: env.YOOKASSA_TEST_MODE,
      appUrl: env.APP_URL,
      shopId,
      secretKey,
    };
  }
  return { provider: "disabled", testMode: false };
}

export function getPublicPaymentConfig(): PaymentPublicConfig {
  const config = getPaymentConfiguration();
  return { available: config.provider !== "disabled", testMode: config.testMode, provider: config.provider };
}

function providerEnum(config: Exclude<PaymentConfiguration, { provider: "disabled" }>) {
  return config.provider === "test" ? PaymentProvider.TEST : PaymentProvider.YOOKASSA;
}

function jsonPayload(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function paymentResult(payment: { id: string; confirmationUrl: string | null }): PaymentCreationResult {
  return { alreadyPaid: false, confirmationUrl: payment.confirmationUrl, paymentId: payment.id };
}

function basicAuthorization(shopId: string, secretKey: string) {
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`, "utf8").toString("base64")}`;
}

async function yooKassaRequest(config: Extract<PaymentConfiguration, { provider: "yookassa" }>, path: string, init?: RequestInit) {
  const response = await fetch(`https://api.yookassa.ru/v3${path}`, {
    ...init,
    headers: {
      Authorization: basicAuthorization(config.shopId, config.secretKey),
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as unknown;
  if (!response.ok) throw new ApiError(502, "Платёжный сервис временно недоступен. Повторите попытку позже.");
  return yooKassaPaymentSchema.parse(payload);
}

export async function createInvoicePayment(invoiceId: string): Promise<PaymentCreationResult> {
  const config = getPaymentConfiguration();
  if (config.provider === "disabled") throw new ApiError(503, "Онлайн-оплата пока не подключена компанией");

  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: { where: { status: PaymentStatus.PENDING }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!invoice) throw new ApiError(404, "Счёт не найден");
  if (invoice.status === InvoiceStatus.PAID) return { alreadyPaid: true, confirmationUrl: null, paymentId: null };
  if (invoice.status === InvoiceStatus.CANCELLED) throw new ApiError(409, "Отменённый счёт нельзя оплатить");

  const expectedProvider = providerEnum(config);
  const reusable = invoice.payments.find((payment) => payment.provider === expectedProvider && payment.confirmationUrl);
  if (reusable) return paymentResult(reusable);

  const idempotencyKey = randomUUID();
  const localPayment = await db.payment.create({
    data: {
      invoiceId: invoice.id,
      provider: expectedProvider,
      amount: invoice.total,
      currency: invoice.currency,
      idempotencyKey,
    },
  });

  if (config.provider === "test") {
    const confirmationUrl = new URL(`/payment/test/${localPayment.id}`, config.appUrl);
    confirmationUrl.searchParams.set("return", `/?payment=test-return&invoice=${invoice.id}`);
    const payment = await db.payment.update({
      where: { id: localPayment.id },
      data: { externalId: `test_${randomUUID()}`, confirmationUrl: confirmationUrl.toString() },
    });
    return paymentResult(payment);
  }

  try {
    const returnUrl = new URL("/", config.appUrl);
    returnUrl.searchParams.set("payment", "return");
    returnUrl.searchParams.set("invoice", invoice.id);
    const providerPayment = await yooKassaRequest(config, "/payments", {
      method: "POST",
      headers: { "Idempotence-Key": idempotencyKey },
      body: JSON.stringify({
        amount: { value: invoice.total.toFixed(2), currency: invoice.currency },
        capture: true,
        confirmation: { type: "redirect", return_url: returnUrl.toString() },
        description: `Оплата счёта № ${invoice.number}`.slice(0, 128),
        metadata: { invoiceId: invoice.id, invoiceNumber: invoice.number, localPaymentId: localPayment.id },
      }),
    });
    const confirmationUrl = providerPayment.confirmation?.confirmation_url;
    if (!confirmationUrl) throw new ApiError(502, "Платёжный сервис не вернул ссылку на оплату");
    const payment = await db.payment.update({
      where: { id: localPayment.id },
      data: { externalId: providerPayment.id, confirmationUrl, rawPayload: jsonPayload(providerPayment) },
    });
    return paymentResult(payment);
  } catch (error) {
    await db.payment.update({ where: { id: localPayment.id }, data: { status: PaymentStatus.CANCELED } });
    throw error;
  }
}

async function markPaymentSucceeded(paymentId: string, rawPayload?: unknown) {
  await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { invoice: true } });
    if (!payment) throw new ApiError(404, "Платёж не найден");
    const paidAt = payment.paidAt ?? new Date();
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SUCCEEDED,
        paidAt,
        ...(rawPayload === undefined ? {} : { rawPayload: jsonPayload(rawPayload) }),
      },
    });
    if (payment.invoice.status === InvoiceStatus.CANCELLED) {
      await writeAudit({
        action: "PAYMENT_RECEIVED_FOR_CANCELLED_INVOICE",
        entityType: "Invoice",
        entityId: payment.invoice.id,
        before: { status: payment.invoice.status },
        after: { paymentId: payment.id, amount: payment.amount.toString() },
      }, tx);
      return;
    }
    if (payment.invoice.status !== InvoiceStatus.PAID) {
      await tx.invoice.update({ where: { id: payment.invoice.id }, data: { status: InvoiceStatus.PAID } });
      await writeAudit({
        action: "PAYMENT_SUCCEEDED",
        entityType: "Invoice",
        entityId: payment.invoice.id,
        before: { status: payment.invoice.status },
        after: { status: InvoiceStatus.PAID, paymentId: payment.id, amount: payment.amount.toString() },
      }, tx);
    }
  });
}

export async function completeTestPayment(paymentId: string) {
  const config = getPaymentConfiguration();
  if (config.provider !== "test" || (process.env.NODE_ENV === "production" && process.env.E2E_TEST_MODE !== "1")) {
    throw new ApiError(404, "Тестовая оплата недоступна");
  }
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.provider !== PaymentProvider.TEST) throw new ApiError(404, "Тестовый платёж не найден");
  await markPaymentSucceeded(payment.id, { mode: "test", completedAt: new Date().toISOString() });
  return payment.invoiceId;
}

export async function synchronizeYooKassaPayment(externalId: string) {
  const config = getPaymentConfiguration();
  if (config.provider !== "yookassa") throw new ApiError(503, "ЮKassa не настроена");
  const localPayment = await db.payment.findUnique({ where: { externalId }, include: { invoice: true } });
  if (!localPayment || localPayment.provider !== PaymentProvider.YOOKASSA) return false;

  const providerPayment = await yooKassaRequest(config, `/payments/${encodeURIComponent(externalId)}`);
  const valid = paymentMatchesInvoice({
    id: localPayment.id,
    invoiceId: localPayment.invoiceId,
    amount: localPayment.amount.toNumber(),
    currency: localPayment.currency,
  }, providerPayment);
  if (!valid) throw new ApiError(409, "Данные платежа не совпадают со счётом");

  if (isConfirmedSuccessfulPayment(providerPayment)) {
    await markPaymentSucceeded(localPayment.id, providerPayment);
  } else if (providerPayment.status === "canceled") {
    await db.payment.update({
      where: { id: localPayment.id },
      data: { status: PaymentStatus.CANCELED, rawPayload: jsonPayload(providerPayment) },
    });
  } else {
    await db.payment.update({ where: { id: localPayment.id }, data: { rawPayload: jsonPayload(providerPayment) } });
  }
  return true;
}

export async function getPublicInvoicePaymentStatus(invoiceId: string) {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { number: true, status: true } });
  if (!invoice) throw new ApiError(404, "Счёт не найден");
  return invoice;
}

export async function getTestPaymentPageData(paymentId: string) {
  const config = getPaymentConfiguration();
  if (config.provider !== "test" || (process.env.NODE_ENV === "production" && process.env.E2E_TEST_MODE !== "1")) return null;
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { invoice: { select: { number: true, status: true } } },
  });
  if (!payment || payment.provider !== PaymentProvider.TEST) return null;
  return {
    id: payment.id,
    amount: payment.amount.toNumber(),
    currency: payment.currency,
    status: payment.status,
    invoiceNumber: payment.invoice.number,
    invoiceStatus: payment.invoice.status,
  };
}
