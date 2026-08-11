"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { missingCompanyPaymentDetails } from "@/lib/domain/company";
import type { SectionProps } from "./AdminConsole";
import { adminRequest, jsonRequest } from "./admin-api";

type Props = SectionProps & { section: "tax" | "company" | "numbering" | "backups" };

export function SettingsSection({ section, data, onSaved }: Props) {
  const [tax, setTax] = useState(data.tax);
  const [company, setCompany] = useState(data.company);
  const [numbering, setNumbering] = useState(data.numbering);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [logoVersion, setLogoVersion] = useState(0);
  const restoreInput = useRef<HTMLInputElement>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось выполнить операцию"); } finally { setBusy(false); }
  }

  if (section === "tax") return <section className="admin-section narrow-section">
    <div className="admin-heading"><div><p className="admin-kicker">НАЛОГИ</p><h1>Настройка НДС</h1></div></div>
    <article className="feature-setting">
      <div><h2>НДС в счетах</h2><p>Переключатель и ставка применяются ко всем новым расчётам. Сохранённые счета не изменяются.</p></div>
      <label className="switch large"><input type="checkbox" checked={tax.enabled} onChange={(event) => setTax((value) => ({ ...value, enabled: event.target.checked }))} /><i /></label>
    </article>
    <div className="setting-form-card"><label>Ставка НДС, %<input type="number" min="0" max="100" step="0.1" value={tax.rate} disabled={!tax.enabled} onChange={(event) => setTax((value) => ({ ...value, rate: Number(event.target.value) }))} /></label><div className="tax-preview"><span>Пример для 100 000 ₽ без НДС</span><strong>{new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(100_000 * (tax.enabled ? 1 + tax.rate / 100 : 1))}</strong></div></div>
    {error && <div className="admin-alert error">{error}</div>}
    <button className="primary-button align-end" disabled={busy} onClick={() => run(async () => { await adminRequest("/api/admin/settings/tax", jsonRequest("PUT", tax)); await onSaved("Настройка НДС сохранена"); })}>{busy ? "Сохраняем…" : "Сохранить"}</button>
  </section>;

  if (section === "company") {
    const missingPaymentDetails = missingCompanyPaymentDetails(company);
    const fields: Array<[keyof typeof company, string]> = [
      ["name", "Короткое название"], ["legalName", "Название компании"], ["inn", "ИНН"], ["kpp", "КПП"], ["ogrn", "ОГРН"],
      ["bankName", "Банк"], ["bik", "БИК"], ["checking", "Расчётный счёт"], ["correspondent", "Корреспондентский счёт"],
      ["address", "Адрес"], ["phone", "Телефон"], ["email", "Email"], ["website", "Сайт"],
    ];
    return <section className="admin-section">
      <div className="admin-heading"><div><p className="admin-kicker">КОМПАНИЯ</p><h1>Реквизиты</h1></div><span>Автоматически попадают в новые PDF и Excel</span></div>
      <div className="company-layout">
        <form className="admin-form-grid" onSubmit={(event) => { event.preventDefault(); void run(async () => { const payload = { name: company.name, legalName: company.legalName, inn: company.inn, kpp: company.kpp, ogrn: company.ogrn, bankName: company.bankName, bik: company.bik, checking: company.checking, correspondent: company.correspondent, address: company.address, phone: company.phone, email: company.email, website: company.website }; await adminRequest("/api/admin/settings/company", jsonRequest("PUT", payload)); await onSaved("Реквизиты сохранены"); }); }}>
          {fields.map(([key, label]) => <label className={key === "legalName" || key === "address" || key === "bankName" ? "span-2" : ""} key={key}>{label}<input value={company[key] ?? ""} onChange={(event) => setCompany((value) => ({ ...value, [key]: event.target.value }))} /></label>)}
          {missingPaymentDetails.length > 0 && <div className="admin-alert warning span-2"><strong>PDF для оплаты пока нельзя сформировать.</strong><br />Заполните обязательные реквизиты: {missingPaymentDetails.join(", ")}.</div>}
          {error && <div className="admin-alert error span-2">{error}</div>}
          <button className="primary-button span-2" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить реквизиты"}</button>
        </form>
        <article className="logo-card"><span>Логотип для документов</span><div className="logo-preview">{company.logoUrl ? <Image src={`${company.logoUrl}?v=${logoVersion}`} alt="Логотип компании" width={300} height={160} unoptimized /> : <b>{company.name}</b>}</div><label className="upload-button">Загрузить PNG или JPEG<input type="file" accept="image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void run(async () => { const form = new FormData(); form.append("logo", file); await adminRequest("/api/admin/company-logo", { method: "PUT", body: form }); setLogoVersion((value) => value + 1); await onSaved("Логотип обновлён"); }); }} /></label><small>До 2 МБ. Используется в PDF.</small></article>
      </div>
    </section>;
  }

  if (section === "numbering") return <section className="admin-section narrow-section">
    <div className="admin-heading"><div><p className="admin-kicker">ДОКУМЕНТЫ</p><h1>Нумерация счетов</h1></div></div>
    <article className="numbering-card"><label>Шаблон номера<input value={numbering.pattern} onChange={(event) => setNumbering((value) => ({ ...value, pattern: event.target.value }))} /></label><label>Следующее число<input type="number" min="1" value={numbering.nextValue} onChange={(event) => setNumbering((value) => ({ ...value, nextValue: Number(event.target.value) }))} /></label><label className="checkbox-line"><input type="checkbox" checked={numbering.resetYearly} onChange={(event) => setNumbering((value) => ({ ...value, resetYearly: event.target.checked }))} />Начинать нумерацию заново каждый год</label><div className="pattern-help"><strong>Доступные переменные</strong><code>{"{NUMBER:6}"}</code> → 000001 · <code>{"{YEAR}-{NUMBER:4}"}</code> → {new Date().getFullYear()}-0001 · <code>{"СБС-{NUMBER:5}"}</code> → СБС-00001</div></article>
    {error && <div className="admin-alert error">{error}</div>}
    <button className="primary-button align-end" disabled={busy} onClick={() => run(async () => { await adminRequest("/api/admin/settings/numbering", jsonRequest("PUT", numbering)); await onSaved("Шаблон нумерации сохранён"); })}>{busy ? "Сохраняем…" : "Сохранить"}</button>
  </section>;

  async function downloadBackup() {
    const response = await fetch("/api/admin/backups");
    if (!response.ok) throw new Error((await response.json() as { error?: string }).error || "Не удалось создать копию");
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") ?? "";
    const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? "sbs-backup.sbsbak";
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
  }
  async function restore(file: File) {
    if (!window.confirm("Восстановление заменит текущие данные содержимым копии и завершит все сессии. Продолжить?")) return;
    const response = await fetch("/api/admin/backups", { method: "POST", body: file });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || "Не удалось восстановить копию");
    window.location.assign("/admin/login");
  }
  return <section className="admin-section">
    <div className="admin-heading"><div><p className="admin-kicker">НАДЁЖНОСТЬ</p><h1>Резервные копии</h1></div><span>Файлы шифруются AES-256-GCM</span></div>
    <div className="backup-actions"><article><div className="backup-icon">↓</div><div><h2>Создать резервную копию</h2><p>Цены, счета, клиенты, пользователи, реквизиты и журнал изменений.</p></div><button className="primary-button" disabled={busy} onClick={() => run(async () => { await downloadBackup(); await onSaved("Резервная копия создана"); })}>Скачать копию</button></article><article><div className="backup-icon danger">↑</div><div><h2>Восстановить данные</h2><p>Текущая база будет заменена данными из зашифрованного файла.</p></div><button className="secondary-button" disabled={busy} onClick={() => restoreInput.current?.click()}>Выбрать файл</button><input ref={restoreInput} hidden type="file" accept=".sbsbak" onChange={(event) => { const file = event.target.files?.[0]; if (file) void run(() => restore(file)); }} /></article></div>
    {error && <div className="admin-alert error">{error}</div>}
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Файл</th><th>Статус</th><th>Размер</th><th>Дата</th><th>Автор</th></tr></thead><tbody>{data.backups.map((backup) => <tr key={backup.id}><td>{backup.fileName}</td><td><span className={`status-pill ${backup.status.toLowerCase()}`}>{backup.status}</span></td><td>{(backup.size / 1024).toFixed(1)} КБ</td><td>{new Date(backup.createdAt).toLocaleString("ru-RU")}</td><td>{backup.createdBy}</td></tr>)}</tbody></table></div>
  </section>;
}
