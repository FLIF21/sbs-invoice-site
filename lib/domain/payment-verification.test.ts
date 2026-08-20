import { describe, expect, it } from "vitest";
import { isConfirmedSuccessfulPayment, paymentMatchesInvoice } from "./payment-verification";

const local = { id: "payment-1", invoiceId: "invoice-1", amount: 12_345.67, currency: "RUB" };
const provider = {
  status: "succeeded",
  paid: true,
  amount: { value: "12345.67", currency: "RUB" },
  metadata: { invoiceId: "invoice-1", localPaymentId: "payment-1" },
};

describe("проверка подтверждения платежа", () => {
  it("принимает только платёж с точной суммой, валютой и привязкой к счёту", () => {
    expect(paymentMatchesInvoice(local, provider)).toBe(true);
    expect(paymentMatchesInvoice(local, { ...provider, amount: { ...provider.amount, value: "12345.66" } })).toBe(false);
    expect(paymentMatchesInvoice(local, { ...provider, amount: { ...provider.amount, currency: "USD" } })).toBe(false);
    expect(paymentMatchesInvoice(local, { ...provider, metadata: { ...provider.metadata, invoiceId: "invoice-2" } })).toBe(false);
    expect(paymentMatchesInvoice(local, { ...provider, metadata: { ...provider.metadata, localPaymentId: "payment-2" } })).toBe(false);
  });

  it("не считает ожидание или неподтверждённую операцию успешной", () => {
    expect(isConfirmedSuccessfulPayment(provider)).toBe(true);
    expect(isConfirmedSuccessfulPayment({ ...provider, status: "pending" })).toBe(false);
    expect(isConfirmedSuccessfulPayment({ ...provider, paid: false })).toBe(false);
  });
});
