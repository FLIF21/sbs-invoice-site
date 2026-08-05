import "server-only";
import { InvoiceStatus, PermissionKey, Prisma } from "@prisma/client";
import { db } from "./db";
import { permissionLabels } from "./permissions";

const decimal = (value: Prisma.Decimal | null | undefined) => value?.toNumber() ?? 0;

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export async function getDashboard() {
  const now = new Date();
  const today = startOfDay(now);
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const year = new Date(now.getFullYear(), 0, 1);
  const chartStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const activeInvoice = { status: { not: InvoiceStatus.CANCELLED } };
  const [todayData, monthData, yearData, allData, newClients, recentInvoices, itemGroups] = await Promise.all([
    db.invoice.aggregate({ where: { ...activeInvoice, createdAt: { gte: today } }, _count: true, _sum: { total: true } }),
    db.invoice.aggregate({ where: { ...activeInvoice, createdAt: { gte: month } }, _count: true, _sum: { total: true } }),
    db.invoice.aggregate({ where: { ...activeInvoice, createdAt: { gte: year } }, _count: true, _sum: { total: true } }),
    db.invoice.aggregate({ where: activeInvoice, _count: true, _sum: { total: true }, _avg: { total: true } }),
    db.client.count({ where: { createdAt: { gte: month } } }),
    db.invoice.findMany({ where: { ...activeInvoice, createdAt: { gte: chartStart } }, select: { createdAt: true, total: true } }),
    db.invoiceItem.groupBy({ where: { invoice: activeInvoice }, by: ["productTypeId"], _sum: { quantity: true, total: true }, orderBy: { _sum: { quantity: "desc" } }, take: 5 }),
  ]);
  const productIds = itemGroups.map((item) => item.productTypeId).filter((id): id is string => Boolean(id));
  const products = await db.productType.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(date),
      count: 0,
      total: 0,
    };
  });
  recentInvoices.forEach((invoice) => {
    const key = `${invoice.createdAt.getFullYear()}-${invoice.createdAt.getMonth()}`;
    const bucket = months.find((item) => item.key === key);
    if (bucket) { bucket.count += 1; bucket.total += invoice.total.toNumber(); }
  });
  return {
    today: { count: todayData._count, total: decimal(todayData._sum.total) },
    month: { count: monthData._count, total: decimal(monthData._sum.total) },
    year: { count: yearData._count, total: decimal(yearData._sum.total) },
    all: { count: allData._count, total: decimal(allData._sum.total), average: decimal(allData._avg.total) },
    newClients,
    months,
    popularProducts: itemGroups.map((item) => ({
      name: products.find((product) => product.id === item.productTypeId)?.name ?? "Удалённое изделие",
      quantity: decimal(item._sum.quantity),
      total: decimal(item._sum.total),
    })),
  };
}

export async function getAdminBootstrap(user: { permissions: PermissionKey[] }) {
  const canViewInvoices = user.permissions.includes(PermissionKey.VIEW_INVOICES);
  const canManageUsers = user.permissions.includes(PermissionKey.MANAGE_USERS);
  const canViewAudit = user.permissions.includes(PermissionKey.VIEW_AUDIT);
  const canManageBackups = user.permissions.includes(PermissionKey.MANAGE_BACKUPS);
  const [dashboard, products, thicknesses, coefficients, tax, company, numbering, invoices, clients, users, audit, backups] = await Promise.all([
    user.permissions.includes(PermissionKey.VIEW_DASHBOARD) ? getDashboard() : null,
    db.productType.findMany({ orderBy: { sortOrder: "asc" }, include: { rates: { include: { thickness: true }, orderBy: [{ tierKey: "asc" }, { thickness: { sortOrder: "asc" } }] } } }),
    db.thickness.findMany({ orderBy: { sortOrder: "asc" }, include: { metalPrice: true } }),
    db.coefficient.findMany({ orderBy: { sortOrder: "asc" } }),
    db.taxSetting.findUniqueOrThrow({ where: { id: "default" } }),
    db.companyProfile.findUniqueOrThrow({ where: { id: "default" } }),
    db.invoiceNumberSetting.findUniqueOrThrow({ where: { id: "default" } }),
    canViewInvoices ? db.invoice.findMany({ take: 100, orderBy: { createdAt: "desc" }, include: { client: true, createdBy: { select: { name: true } }, _count: { select: { items: true } } } }) : [],
    user.permissions.includes(PermissionKey.MANAGE_CLIENTS) || canViewInvoices ? db.client.findMany({ take: 200, orderBy: { updatedAt: "desc" }, include: { _count: { select: { invoices: true } }, invoices: { select: { total: true } } } }) : [],
    canManageUsers ? db.user.findMany({ orderBy: { createdAt: "asc" }, include: { permissions: true } }) : [],
    canViewAudit ? db.auditLog.findMany({ take: 200, orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true, email: true } } } }) : [],
    canManageBackups ? db.backupRecord.findMany({ take: 50, orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } }) : [],
  ]);

  const enabledCoefficient = coefficients.filter((item) => item.enabled).reduce((value, item) => value * item.value.toNumber(), 1);
  const taxMultiplier = tax.enabled ? 1 + tax.rate.toNumber() / 100 : 1;
  const metalByThickness = new Map(thicknesses.map((item) => [item.id, item.metalPrice?.costPerSquareMeter.toNumber() ?? 0]));
  return {
    dashboard,
    permissionLabels,
    products: products.map((product) => ({
      id: product.id,
      code: product.code,
      name: product.name,
      category: product.category,
      active: product.active,
      rates: product.rates.map((rate) => {
        const base = metalByThickness.get(rate.thicknessId)! * rate.materialMultiplier.toNumber() + rate.laborCost.toNumber();
        return {
          id: rate.id,
          productName: product.name,
          tierKey: rate.tierKey,
          minBoundary: rate.minBoundary?.toNumber() ?? null,
          maxBoundary: rate.maxBoundary?.toNumber() ?? null,
          thicknessCode: rate.thickness.code,
          materialMultiplier: rate.materialMultiplier.toNumber(),
          laborCost: rate.laborCost.toNumber(),
          currentGrossRate: base * enabledCoefficient * taxMultiplier,
        };
      }),
    })),
    thicknesses: thicknesses.map((item) => ({
      id: item.id,
      code: item.code,
      label: item.label,
      millimeters: item.millimeters.toNumber(),
      costPerSquareMeter: item.metalPrice?.costPerSquareMeter.toNumber() ?? 0,
    })),
    coefficients: coefficients.map((item) => ({ id: item.id, key: item.key, name: item.name, value: item.value.toNumber(), enabled: item.enabled })),
    tax: { enabled: tax.enabled, rate: tax.rate.toNumber() },
    company: {
      name: company.name, legalName: company.legalName, inn: company.inn ?? "", kpp: company.kpp ?? "", ogrn: company.ogrn ?? "",
      bankName: company.bankName ?? "", bik: company.bik ?? "", checking: company.checking ?? "", correspondent: company.correspondent ?? "",
      address: company.address ?? "", phone: company.phone ?? "", email: company.email ?? "", website: company.website ?? "",
      logoUrl: company.logo ? "/api/public/company-logo" : null,
    },
    numbering: { pattern: numbering.pattern, nextValue: numbering.nextValue, resetYearly: numbering.resetYearly },
    invoices: invoices.map((invoice) => ({
      id: invoice.id, number: invoice.number, status: invoice.status, issueDate: invoice.issueDate.toISOString(), client: invoice.client?.name ?? "—",
      clientInn: invoice.client?.inn ?? "", total: invoice.total.toNumber(), items: invoice._count.items, manager: invoice.createdBy?.name ?? "Сайт",
    })),
    clients: clients.map((client) => ({
      id: client.id, name: client.name, inn: client.inn ?? "", kpp: client.kpp ?? "", address: client.address ?? "", phone: client.phone ?? "",
      email: client.email ?? "", invoiceCount: client._count.invoices, total: client.invoices.reduce((sum, invoice) => sum + invoice.total.toNumber(), 0),
    })),
    users: users.map((item) => ({
      id: item.id, name: item.name, email: item.email, role: item.role, active: item.active,
      permissions: item.permissions.filter((permission) => permission.allowed).map((permission) => permission.permission),
    })),
    audit: audit.map((item) => ({
      id: item.id, createdAt: item.createdAt.toISOString(), actor: item.actor?.name ?? "Система", action: item.action,
      entityType: item.entityType, entityId: item.entityId, before: item.before, after: item.after,
    })),
    backups: backups.map((item) => ({
      id: item.id, fileName: item.fileName, size: item.size, status: item.status, createdAt: item.createdAt.toISOString(), createdBy: item.createdBy?.name ?? "—",
    })),
  };
}
