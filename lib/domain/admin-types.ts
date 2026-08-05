import type { PermissionName, RoleName } from "./access";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  permissions: PermissionName[];
};

export type AdminData = {
  dashboard: null | {
    today: { count: number; total: number };
    month: { count: number; total: number };
    year: { count: number; total: number };
    all: { count: number; total: number; average: number };
    newClients: number;
    months: Array<{ key: string; label: string; count: number; total: number }>;
    popularProducts: Array<{ name: string; quantity: number; total: number }>;
  };
  permissionLabels: Record<PermissionName, string>;
  products: Array<{
    id: string; code: string; name: string; category: string; active: boolean;
    rates: Array<{ id: string; productName: string; tierKey: string; minBoundary: number | null; maxBoundary: number | null; thicknessCode: string; materialMultiplier: number; laborCost: number; currentGrossRate: number }>;
  }>;
  thicknesses: Array<{ id: string; code: string; label: string; millimeters: number; costPerSquareMeter: number }>;
  coefficients: Array<{ id: string; key: string; name: string; value: number; enabled: boolean }>;
  tax: { enabled: boolean; rate: number };
  company: Record<"name" | "legalName" | "inn" | "kpp" | "ogrn" | "bankName" | "bik" | "checking" | "correspondent" | "address" | "phone" | "email" | "website", string> & { logoUrl: string | null };
  numbering: { pattern: string; nextValue: number; resetYearly: boolean };
  invoices: Array<{ id: string; number: string; status: string; issueDate: string; client: string; clientInn: string; total: number; items: number; manager: string }>;
  clients: Array<{ id: string; name: string; inn: string; kpp: string; address: string; phone: string; email: string; invoiceCount: number; total: number }>;
  users: Array<{ id: string; name: string; email: string; role: RoleName; active: boolean; permissions: PermissionName[] }>;
  audit: Array<{ id: string; createdAt: string; actor: string; action: string; entityType: string; entityId: string | null; before: unknown; after: unknown }>;
  backups: Array<{ id: string; fileName: string; size: number; status: string; createdAt: string; createdBy: string }>;
};

export type AdminBootstrap = { user: AdminUser; data: AdminData };
