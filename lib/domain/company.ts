import type { CompanySnapshot } from "./types";

const requiredPaymentFields = [
  ["legalName", "юридическое наименование"],
  ["inn", "ИНН"],
  ["kpp", "КПП"],
  ["address", "адрес"],
  ["bankName", "банк"],
  ["bik", "БИК"],
  ["checking", "расчётный счёт"],
  ["correspondent", "корреспондентский счёт"],
] as const satisfies ReadonlyArray<readonly [keyof CompanySnapshot, string]>;

export function missingCompanyPaymentDetails(company: CompanySnapshot) {
  return requiredPaymentFields
    .filter(([key]) => !String(company[key] ?? "").trim())
    .map(([, label]) => label);
}

export function assertCompanyPaymentDetails(company: CompanySnapshot) {
  const missing = missingCompanyPaymentDetails(company);
  if (missing.length > 0) {
    throw new Error(`PDF не сформирован. В настройках компании заполните: ${missing.join(", ")}.`);
  }
}
