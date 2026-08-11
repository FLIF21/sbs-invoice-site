import { describe, expect, it } from "vitest";
import { assertCompanyPaymentDetails, missingCompanyPaymentDetails } from "./company";
import type { CompanySnapshot } from "./types";

const completeCompany: CompanySnapshot = {
  name: "СБС",
  legalName: "ООО «Поставщик»",
  inn: "7700000000",
  kpp: "770001001",
  ogrn: "1000000000000",
  bankName: "АО «Расчётный банк»",
  bik: "044525000",
  checking: "40702810000000000000",
  correspondent: "30101810000000000000",
  address: "г. Москва, ул. Производственная, д. 1",
  phone: "+7 495 000-00-00",
  email: "billing@example.test",
  website: "example.test",
};

describe("реквизиты компании для PDF", () => {
  it("принимает полный набор платёжных реквизитов", () => {
    expect(missingCompanyPaymentDetails(completeCompany)).toEqual([]);
    expect(() => assertCompanyPaymentDetails(completeCompany)).not.toThrow();
  });

  it("перечисляет отсутствующие обязательные поля", () => {
    const incomplete = { ...completeCompany, bik: null, checking: null };
    expect(missingCompanyPaymentDetails(incomplete)).toEqual(["БИК", "расчётный счёт"]);
    expect(() => assertCompanyPaymentDetails(incomplete)).toThrow(/БИК, расчётный счёт/);
  });
});
