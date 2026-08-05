import "server-only";
import { PermissionKey, UserRole, type UserPermission } from "@prisma/client";

export const permissionLabels: Record<PermissionKey, string> = {
  VIEW_DASHBOARD: "Просмотр аналитики",
  MANAGE_PRICING: "Изменение цен изделий",
  MANAGE_METAL: "Изменение стоимости металла",
  MANAGE_COEFFICIENTS: "Изменение коэффициентов",
  MANAGE_TAX: "Изменение НДС",
  MANAGE_COMPANY: "Изменение реквизитов и логотипа",
  MANAGE_NUMBERING: "Изменение нумерации",
  VIEW_INVOICES: "Просмотр счетов",
  CREATE_INVOICES: "Создание счетов",
  EDIT_INVOICES: "Редактирование счетов",
  DELETE_INVOICES: "Удаление счетов",
  MANAGE_CLIENTS: "Управление клиентами",
  MANAGE_USERS: "Управление пользователями",
  VIEW_AUDIT: "Просмотр истории изменений",
  MANAGE_BACKUPS: "Резервное копирование и восстановление",
};

const roleDefaults: Record<UserRole, Set<PermissionKey>> = {
  ADMIN: new Set(Object.values(PermissionKey)),
  MANAGER: new Set([
    PermissionKey.VIEW_DASHBOARD,
    PermissionKey.VIEW_INVOICES,
    PermissionKey.CREATE_INVOICES,
    PermissionKey.EDIT_INVOICES,
    PermissionKey.MANAGE_CLIENTS,
  ]),
  VIEWER: new Set([PermissionKey.VIEW_DASHBOARD, PermissionKey.VIEW_INVOICES]),
};

export function hasPermission(
  user: { role: UserRole; permissions: Pick<UserPermission, "permission" | "allowed">[] },
  permission: PermissionKey,
) {
  if (user.role === UserRole.ADMIN) return true;
  const override = user.permissions.find((item) => item.permission === permission);
  return override?.allowed ?? roleDefaults[user.role].has(permission);
}

export function resolvedPermissions(
  user: { role: UserRole; permissions: Pick<UserPermission, "permission" | "allowed">[] },
) {
  return Object.values(PermissionKey).filter((permission) => hasPermission(user, permission));
}
