export const invoiceStatusLabels = {
  DRAFT: "Черновик",
  ISSUED: "Выставлен",
  PAID: "Оплачен",
  CANCELLED: "Отменён",
} as const;

export type InvoiceStatusValue = keyof typeof invoiceStatusLabels;

export function invoiceStatusLabel(status: string) {
  return status in invoiceStatusLabels ? invoiceStatusLabels[status as InvoiceStatusValue] : status;
}
