export type LocalPaymentVerificationData = {
  id: string;
  invoiceId: string;
  amount: number;
  currency: string;
};

export type ProviderPaymentVerificationData = {
  status: string;
  paid: boolean;
  amount: { value: string; currency: string };
  metadata?: Record<string, unknown>;
};

function minorUnits(value: string | number) {
  const normalized = typeof value === "number" ? value.toFixed(2) : value;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function paymentMatchesInvoice(local: LocalPaymentVerificationData, provider: ProviderPaymentVerificationData) {
  const metadata = provider.metadata ?? {};
  const localAmount = minorUnits(local.amount);
  const providerAmount = minorUnits(provider.amount.value);
  return localAmount !== null
    && providerAmount !== null
    && localAmount === providerAmount
    && provider.amount.currency === local.currency
    && metadata.invoiceId === local.invoiceId
    && metadata.localPaymentId === local.id;
}

export function isConfirmedSuccessfulPayment(payment: ProviderPaymentVerificationData) {
  return payment.status === "succeeded" && payment.paid;
}
