"use client";

import { useMemo, useState } from "react";
import type { AdminData } from "@/lib/domain/admin-types";
import { adminRequest, jsonRequest } from "../admin-api";

const rub = (value: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value);

export function ClientsSection({ clients, onSaved }: { clients: AdminData["clients"]; onSaved: (message: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState<AdminData["clients"][number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const filtered = useMemo(() => clients.filter((client) => `${client.name} ${client.inn} ${client.phone} ${client.email}`.toLowerCase().includes(query.toLowerCase())), [clients, query]);
  return <section className="admin-section">
    <div className="admin-heading"><div><p className="admin-kicker">CRM</p><h1>База клиентов</h1></div><span>{clients.length} организаций</span></div>
    <div className="table-toolbar"><input type="search" placeholder="Название, ИНН, телефон или email" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
    {error && <div className="admin-alert error">{error}</div>}
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Компания</th><th>Контакты</th><th>Адрес</th><th>Счетов</th><th>Сумма</th><th /></tr></thead><tbody>{filtered.map((client) => <tr key={client.id}><td><strong>{client.name}</strong><small>{client.inn ? `ИНН ${client.inn}` : ""}</small></td><td>{client.phone}<small>{client.email}</small></td><td>{client.address || "—"}</td><td>{client.invoiceCount}</td><td>{rub(client.total)}</td><td><button className="text-button" onClick={() => setEdit({ ...client })}>Изменить</button></td></tr>)}</tbody></table></div>
    {edit && <div className="modal-backdrop"><form className="admin-modal" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); try { await adminRequest(`/api/admin/clients/${edit.id}`, jsonRequest("PUT", edit)); setEdit(null); await onSaved("Карточка клиента обновлена"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось сохранить"); } finally { setBusy(false); } }}><button type="button" className="modal-close" onClick={() => setEdit(null)}>×</button><h2>Карточка клиента</h2><div className="admin-form-grid">{(["name", "inn", "kpp", "address", "phone", "email"] as const).map((key) => <label className={key === "address" ? "span-2" : ""} key={key}>{({ name: "Название", inn: "ИНН", kpp: "КПП", address: "Адрес", phone: "Телефон", email: "Email" })[key]}<input value={edit[key]} onChange={(event) => setEdit({ ...edit, [key]: event.target.value })} /></label>)}</div><button className="primary-button" disabled={busy}>Сохранить</button></form></div>}
  </section>;
}
