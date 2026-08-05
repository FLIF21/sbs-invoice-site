"use client";

import type { AdminUser } from "@/lib/domain/admin-types";
import type { SectionProps } from "./AdminConsole";
import { AuditSection } from "./records/AuditSection";
import { ClientsSection } from "./records/ClientsSection";
import { InvoicesSection } from "./records/InvoicesSection";
import { UsersSection } from "./records/UsersSection";

type Props = SectionProps & { section: "invoices" | "clients" | "users" | "audit"; user: AdminUser };

export function RecordsSection({ section, data, user, onSaved }: Props) {
  if (section === "invoices") return <InvoicesSection invoices={data.invoices} products={data.products} thicknesses={data.thicknesses} permissions={user.permissions} onSaved={onSaved} />;
  if (section === "clients") return <ClientsSection clients={data.clients} onSaved={onSaved} />;
  if (section === "users") return <UsersSection users={data.users} permissionLabels={data.permissionLabels} onSaved={onSaved} />;
  return <AuditSection entries={data.audit} />;
}
