"use client";

import { useMemo, useState } from "react";
import type { AdminData } from "@/lib/domain/admin-types";

const actionLabels: Record<string, string> = { CREATE: "создал", UPDATE: "изменил", CANCEL: "отменил", DISABLE: "отключил", UPDATE_LOGO: "заменил логотип", RESTORE: "восстановил", CREATE_BACKUP: "создал копию" };
const entityLabels: Record<string, string> = { Invoice: "счёт", ProductRate: "цену", MetalPrice: "стоимость металла", Coefficient: "коэффициенты", TaxSetting: "НДС", CompanyProfile: "реквизиты", InvoiceNumberSetting: "нумерацию", User: "пользователя", Client: "клиента", Backup: "резервную копию" };

function compact(value: unknown) {
  if (!value) return "—";
  const source = JSON.stringify(value);
  return source.length > 220 ? `${source.slice(0, 220)}…` : source;
}

export function AuditSection({ entries }: { entries: AdminData["audit"] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => entries.filter((entry) => `${entry.actor} ${entry.action} ${entry.entityType} ${compact(entry.before)} ${compact(entry.after)}`.toLowerCase().includes(query.toLowerCase())), [entries, query]);
  return <section className="admin-section">
    <div className="admin-heading"><div><p className="admin-kicker">АУДИТ</p><h1>История изменений</h1></div><span>Журнал доступен только для чтения</span></div>
    <div className="table-toolbar"><input type="search" placeholder="Кто, что или какое значение" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="audit-timeline">{filtered.map((entry) => <article key={entry.id}><time>{new Date(entry.createdAt).toLocaleString("ru-RU")}</time><div className="audit-dot" /><div><h3><strong>{entry.actor}</strong> {actionLabels[entry.action] ?? entry.action.toLowerCase()} {entityLabels[entry.entityType] ?? entry.entityType}</h3><p>{entry.entityId ? `ID: ${entry.entityId}` : "Системная настройка"}</p>{Boolean(entry.before || entry.after) && <div className="change-diff"><code>{compact(entry.before)}</code><b>→</b><code>{compact(entry.after)}</code></div>}</div></article>)}</div>
    {!filtered.length && <p className="empty-state">Записи не найдены.</p>}
  </section>;
}
