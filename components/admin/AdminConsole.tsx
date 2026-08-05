"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AdminBootstrap, AdminData, AdminUser } from "@/lib/domain/admin-types";
import { Permission, type PermissionName } from "@/lib/domain/access";
import { adminRequest } from "./admin-api";
import { DashboardSection } from "./DashboardSection";
import { CatalogSection } from "./CatalogSection";
import { SettingsSection } from "./SettingsSection";
import { RecordsSection } from "./RecordsSection";

type Section = "dashboard" | "pricing" | "metal" | "coefficients" | "tax" | "company" | "numbering" | "invoices" | "clients" | "users" | "audit" | "backups";

const navigation: Array<{ id: Section; label: string; group: string; permission: PermissionName }> = [
  { id: "dashboard", label: "Аналитика", group: "Обзор", permission: Permission.VIEW_DASHBOARD },
  { id: "invoices", label: "Счета", group: "Продажи", permission: Permission.VIEW_INVOICES },
  { id: "clients", label: "Клиенты", group: "Продажи", permission: Permission.MANAGE_CLIENTS },
  { id: "pricing", label: "Цены изделий", group: "Прайс", permission: Permission.MANAGE_PRICING },
  { id: "metal", label: "Металл", group: "Прайс", permission: Permission.MANAGE_METAL },
  { id: "coefficients", label: "Коэффициенты", group: "Прайс", permission: Permission.MANAGE_COEFFICIENTS },
  { id: "tax", label: "НДС", group: "Настройки", permission: Permission.MANAGE_TAX },
  { id: "company", label: "Реквизиты", group: "Настройки", permission: Permission.MANAGE_COMPANY },
  { id: "numbering", label: "Нумерация", group: "Настройки", permission: Permission.MANAGE_NUMBERING },
  { id: "users", label: "Пользователи", group: "Система", permission: Permission.MANAGE_USERS },
  { id: "audit", label: "История изменений", group: "Система", permission: Permission.VIEW_AUDIT },
  { id: "backups", label: "Резервные копии", group: "Система", permission: Permission.MANAGE_BACKUPS },
];

export function AdminConsole() {
  const [bootstrap, setBootstrap] = useState<AdminBootstrap | null>(null);
  const [active, setActive] = useState<Section>("dashboard");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      setBootstrap(await adminRequest<AdminBootstrap>("/api/admin/bootstrap"));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    adminRequest<AdminBootstrap>("/api/admin/bootstrap")
      .then((result) => { if (!cancelled) { setBootstrap(result); setError(""); } })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Не удалось загрузить данные"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const allowedNavigation = useMemo(() => bootstrap
    ? navigation.filter((item) => bootstrap.user.permissions.includes(item.permission))
    : [], [bootstrap]);
  const currentActive = allowedNavigation.some((item) => item.id === active) ? active : allowedNavigation[0]?.id ?? active;

  async function logout() {
    await adminRequest("/api/auth/logout", { method: "POST" });
    window.location.assign("/admin/login");
  }

  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(""), 3_500); };
  if (loading && !bootstrap) return <main className="admin-loading"><span className="admin-spinner" />Загружаем систему…</main>;
  if (!bootstrap) return <main className="admin-loading"><div className="admin-alert error">{error}</div><button onClick={() => load()}>Повторить</button></main>;

  return <main className="admin-app" data-theme={dark ? "dark" : "light"}>
    <aside className={`admin-sidebar ${menuOpen ? "open" : ""}`}>
      <div className="admin-logo"><span>СБС</span><div>Управление<small>invoice system</small></div></div>
      <nav>
        {[...new Set(allowedNavigation.map((item) => item.group))].map((group) => <div className="nav-group" key={group}>
          <p>{group}</p>
          {allowedNavigation.filter((item) => item.group === group).map((item) => <button className={currentActive === item.id ? "active" : ""} key={item.id} onClick={() => { setActive(item.id); setMenuOpen(false); }}><i />{item.label}</button>)}
        </div>)}
      </nav>
      <div className="admin-profile"><div><strong>{bootstrap.user.name}</strong><small>{bootstrap.user.email}</small></div><button onClick={logout} title="Выйти">↗</button></div>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar">
        <button className="menu-button" onClick={() => setMenuOpen((value) => !value)}>☰</button>
        <div><span className="live-dot" />Система работает</div>
        <div className="admin-top-actions"><Link href="/" target="_blank">Открыть сайт ↗</Link><button onClick={() => setDark((value) => !value)}>{dark ? "Светлая" : "Тёмная"} тема</button></div>
      </header>
      <div className="admin-content">
        {error && <div className="admin-alert error">{error}</div>}
        {notice && <div className="admin-toast">{notice}</div>}
        {currentActive === "dashboard" && bootstrap.data.dashboard && <DashboardSection dashboard={bootstrap.data.dashboard} />}
        {(["pricing", "metal", "coefficients"] as Section[]).includes(currentActive) && <CatalogSection key={currentActive} section={currentActive as "pricing" | "metal" | "coefficients"} data={bootstrap.data} onSaved={async (message) => { notify(message); await load(true); }} />}
        {(["tax", "company", "numbering", "backups"] as Section[]).includes(currentActive) && <SettingsSection key={currentActive} section={currentActive as "tax" | "company" | "numbering" | "backups"} data={bootstrap.data} onSaved={async (message) => { notify(message); await load(true); }} />}
        {(["invoices", "clients", "users", "audit"] as Section[]).includes(currentActive) && <RecordsSection key={currentActive} section={currentActive as "invoices" | "clients" | "users" | "audit"} data={bootstrap.data} user={bootstrap.user} onSaved={async (message) => { notify(message); await load(true); }} />}
      </div>
    </div>
  </main>;
}

export type SectionProps = { data: AdminData; user?: AdminUser; onSaved: (message: string) => Promise<void> };
