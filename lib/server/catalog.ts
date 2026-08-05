import "server-only";
import { db } from "./db";
import { formatInvoiceNumber } from "@/lib/domain/pricing";
import type { CompanySnapshot, PublicCatalog } from "@/lib/domain/types";

export async function getCompanySnapshot(): Promise<CompanySnapshot> {
  const company = await db.companyProfile.findUniqueOrThrow({ where: { id: "default" } });
  return {
    name: company.name,
    legalName: company.legalName,
    inn: company.inn,
    kpp: company.kpp,
    ogrn: company.ogrn,
    bankName: company.bankName,
    bik: company.bik,
    checking: company.checking,
    correspondent: company.correspondent,
    address: company.address,
    phone: company.phone,
    email: company.email,
    website: company.website,
    logoUrl: company.logo ? "/api/public/company-logo" : null,
  };
}

export async function getPublicCatalog(): Promise<PublicCatalog> {
  const [products, thicknesses, coefficients, tax, company, numbering, latestRate, latestMetal] = await Promise.all([
    db.productType.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { rates: { where: { active: true } } },
    }),
    db.thickness.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { metalPrice: true },
    }),
    db.coefficient.findMany({ orderBy: { sortOrder: "asc" } }),
    db.taxSetting.findUniqueOrThrow({ where: { id: "default" } }),
    getCompanySnapshot(),
    db.invoiceNumberSetting.findUniqueOrThrow({ where: { id: "default" } }),
    db.productRate.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    db.metalPrice.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  const year = new Date().getFullYear();
  const nextValue = numbering.resetYearly && numbering.lastYear !== year ? 1 : numbering.nextValue;
  const latest = [latestRate?.updatedAt, latestMetal?.updatedAt].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? new Date();

  return {
    products: products.map((product) => ({
      id: product.id,
      code: product.code,
      name: product.name,
      category: product.category,
      description: product.description,
      imagePath: product.imagePath,
      defaultDimensions: product.defaultDimensions as PublicCatalog["products"][number]["defaultDimensions"],
      calculationMethod: product.calculationMethod,
      rates: product.rates.map((rate) => ({
        id: rate.id,
        thicknessCode: thicknesses.find((item) => item.id === rate.thicknessId)?.code ?? "",
        tierKey: rate.tierKey,
        minBoundary: rate.minBoundary?.toNumber() ?? null,
        maxBoundary: rate.maxBoundary?.toNumber() ?? null,
        materialMultiplier: rate.materialMultiplier.toNumber(),
        laborCost: rate.laborCost.toNumber(),
      })),
    })),
    thicknesses: thicknesses.map((thickness) => ({
      id: thickness.id,
      code: thickness.code,
      millimeters: thickness.millimeters.toNumber(),
      label: thickness.label,
      metalCost: thickness.metalPrice?.costPerSquareMeter.toNumber() ?? 0,
    })),
    coefficients: coefficients.map((coefficient) => ({
      id: coefficient.id,
      key: coefficient.key,
      name: coefficient.name,
      value: coefficient.value.toNumber(),
      enabled: coefficient.enabled,
    })),
    tax: { enabled: tax.enabled, rate: tax.rate.toNumber() },
    company,
    invoiceNumberPreview: formatInvoiceNumber(numbering.pattern, nextValue, year),
    pricesUpdatedAt: latest.toISOString(),
  };
}
