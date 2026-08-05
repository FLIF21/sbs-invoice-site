"use client";

import { useMemo, useState } from "react";
import { downloadInvoiceExcel } from "@/app/excel-export";
import { downloadInvoicePdf } from "@/lib/client/pdf-export";
import { Permission, type PermissionName } from "@/lib/domain/access";
import type { AdminData } from "@/lib/domain/admin-types";
import type { InvoiceDocument, ProductDimensions } from "@/lib/domain/types";
import { adminRequest, jsonRequest } from "../admin-api";

const rub = (value: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(value);

type Props = {
  invoices: AdminData["invoices"];
  products: AdminData["products"];
  thicknesses: AdminData["thicknesses"];
  permissions: PermissionName[];
  onSaved: (message: string) => Promise<void>;
};

export function InvoicesSection({ invoices, products, thicknesses, permissions, onSaved }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [document, setDocument] = useState<InvoiceDocument | null>(null);
  const [edit, setEdit] = useState<InvoiceDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const filtered = useMemo(() => invoices.filter((invoice) => {
    const source = `${invoice.number} ${invoice.client} ${invoice.clientInn} ${invoice.manager}`.toLowerCase();
    return source.includes(query.toLowerCase()) && (status === "ALL" || invoice.status === status);
  }), [invoices, query, status]);

  async function action(run: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await run(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось выполнить операцию"); }
    finally { setBusy(false); }
  }

  async function loadInvoice(id: string) {
    await action(async () => setDocument(await adminRequest<InvoiceDocument>(`/api/admin/invoices/${id}`)));
  }

  async function saveInvoice(invoice: InvoiceDocument) {
    await action(async () => {
      await adminRequest(`/api/admin/invoices/${invoice.id}`, jsonRequest("PUT", {
        status: invoice.status,
        project: invoice.project ?? "",
        requestNumber: invoice.requestNumber ?? "",
        applicant: invoice.applicant ?? "",
        dueDate: invoice.dueDate?.slice(0, 10) ?? "",
        notes: invoice.notes ?? "",
        client: {
          name: invoice.client.name,
          inn: invoice.client.inn ?? "",
          kpp: invoice.client.kpp ?? "",
          address: invoice.client.address ?? "",
          phone: invoice.client.phone ?? "",
          email: invoice.client.email ?? "",
        },
        items: invoice.items.map((item) => ({
          productCode: item.productCode,
          thicknessCode: item.thicknessCode,
          quantity: item.quantity,
          dimensions: item.dimensions,
        })),
      }));
      setEdit(null);
      await onSaved("Счёт пересчитан и обновлён");
    });
  }

  return <section className="admin-section">
    <div className="admin-heading"><div><p className="admin-kicker">ПРОДАЖИ</p><h1>История счетов</h1></div><span>{invoices.length} последних документов</span></div>
    <div className="table-toolbar">
      <input type="search" placeholder="Номер, клиент, ИНН или менеджер" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">Все статусы</option><option value="ISSUED">Выставлен</option><option value="PAID">Оплачен</option><option value="DRAFT">Черновик</option><option value="CANCELLED">Отменён</option></select>
    </div>
    {error && <div className="admin-alert error">{error}</div>}
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Счёт</th><th>Клиент</th><th>Дата</th><th>Позиций</th><th>Менеджер</th><th>Сумма</th><th /></tr></thead><tbody>
      {filtered.map((invoice) => <tr key={invoice.id}>
        <td><button className="text-button" onClick={() => loadInvoice(invoice.id)}><strong>№ {invoice.number}</strong></button><span className={`status-pill ${invoice.status.toLowerCase()}`}>{invoice.status}</span></td>
        <td>{invoice.client}<small>{invoice.clientInn}</small></td>
        <td>{new Date(invoice.issueDate).toLocaleDateString("ru-RU")}</td><td>{invoice.items}</td><td>{invoice.manager}</td><td><strong>{rub(invoice.total)}</strong></td>
        <td><div className="row-actions"><button title="Открыть" onClick={() => loadInvoice(invoice.id)}>↗</button>
          {permissions.includes(Permission.CREATE_INVOICES) && <button title="Копировать" onClick={() => action(async () => { const copy = await adminRequest<InvoiceDocument>(`/api/admin/invoices/${invoice.id}/copy`, { method: "POST" }); await onSaved(`Создана копия № ${copy.number}`); })}>⧉</button>}
          {permissions.includes(Permission.DELETE_INVOICES) && invoice.status !== "CANCELLED" && <button className="danger" title="Отменить" onClick={() => { if (window.confirm(`Отменить счёт № ${invoice.number}?`)) void action(async () => { await adminRequest(`/api/admin/invoices/${invoice.id}`, { method: "DELETE" }); await onSaved("Счёт отменён"); }); }}>×</button>}
        </div></td>
      </tr>)}
    </tbody></table></div>
    {!filtered.length && <p className="empty-state">Счета по заданным условиям не найдены.</p>}

    {document && <InvoicePreview invoice={document} canEdit={permissions.includes(Permission.EDIT_INVOICES)} onClose={() => setDocument(null)} onEdit={() => { setEdit(structuredClone(document)); setDocument(null); }} />}
    {edit && <InvoiceEditor invoice={edit} products={products} thicknesses={thicknesses} busy={busy} onChange={setEdit} onClose={() => setEdit(null)} onSave={saveInvoice} />}
  </section>;
}

function InvoicePreview({ invoice, canEdit, onClose, onEdit }: { invoice: InvoiceDocument; canEdit: boolean; onClose: () => void; onEdit: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><article className="admin-modal invoice-modal">
    <button className="modal-close" onClick={onClose}>×</button>
    <div className="modal-title"><div><span>СЧЁТ</span><h2>№ {invoice.number}</h2></div><strong>{rub(invoice.total)}</strong></div>
    <div className="invoice-facts"><div><span>Покупатель</span><b>{invoice.client.name}</b><small>{invoice.client.inn ? `ИНН ${invoice.client.inn}` : ""}</small></div><div><span>Дата</span><b>{new Date(invoice.issueDate).toLocaleDateString("ru-RU")}</b></div><div><span>Статус</span><b>{invoice.status}</b></div></div>
    <div className="modal-table"><table><thead><tr><th>Изделие</th><th>Кол-во</th><th>Площадь</th><th>Сумма</th></tr></thead><tbody>{invoice.items.map((item, index) => <tr key={`${item.productCode}-${index}`}><td>{item.description}</td><td>{item.quantity}</td><td>{item.area.toFixed(2)} м²</td><td>{rub(item.grossTotal)}</td></tr>)}</tbody></table></div>
    <div className="modal-actions"><button className="secondary-button" onClick={() => downloadInvoicePdf(invoice)}>PDF</button><button className="secondary-button" onClick={() => downloadInvoiceExcel(invoice)}>Excel</button>{canEdit && <button className="primary-button" onClick={onEdit}>Редактировать</button>}</div>
  </article></div>;
}

function InvoiceEditor({ invoice, products, thicknesses, busy, onChange, onClose, onSave }: { invoice: InvoiceDocument; products: AdminData["products"]; thicknesses: AdminData["thicknesses"]; busy: boolean; onChange: (invoice: InvoiceDocument) => void; onClose: () => void; onSave: (invoice: InvoiceDocument) => Promise<void> }) {
  const updateDimension = (itemIndex: number, key: string, value: string | number) => onChange({
    ...invoice,
    items: invoice.items.map((item, index) => index === itemIndex ? { ...item, dimensions: { ...item.dimensions, [key]: value } as ProductDimensions } : item),
  });
  return <div className="modal-backdrop"><form className="admin-modal edit-invoice-modal" onSubmit={(event) => { event.preventDefault(); void onSave(invoice); }}>
    <button type="button" className="modal-close" onClick={onClose}>×</button><h2>Редактировать № {invoice.number}</h2>
    <div className="admin-form-grid">
      <label>Статус<select value={invoice.status} onChange={(event) => onChange({ ...invoice, status: event.target.value })}><option>ISSUED</option><option>PAID</option><option>DRAFT</option><option>CANCELLED</option></select></label>
      <label>Требуется к<input type="date" value={invoice.dueDate?.slice(0, 10) ?? ""} onChange={(event) => onChange({ ...invoice, dueDate: event.target.value ? `${event.target.value}T12:00:00.000Z` : null })} /></label>
      <label>Проект<input value={invoice.project ?? ""} onChange={(event) => onChange({ ...invoice, project: event.target.value })} /></label>
      <label>№ заявки<input value={invoice.requestNumber ?? ""} onChange={(event) => onChange({ ...invoice, requestNumber: event.target.value })} /></label>
      <label>Заявитель<input value={invoice.applicant ?? ""} onChange={(event) => onChange({ ...invoice, applicant: event.target.value })} /></label>
      <label>Покупатель<input value={invoice.client.name} onChange={(event) => onChange({ ...invoice, client: { ...invoice.client, name: event.target.value } })} /></label>
      <label>ИНН<input value={invoice.client.inn ?? ""} onChange={(event) => onChange({ ...invoice, client: { ...invoice.client, inn: event.target.value } })} /></label>
      <label>КПП<input value={invoice.client.kpp ?? ""} onChange={(event) => onChange({ ...invoice, client: { ...invoice.client, kpp: event.target.value } })} /></label>
      <label className="span-2">Адрес<input value={invoice.client.address ?? ""} onChange={(event) => onChange({ ...invoice, client: { ...invoice.client, address: event.target.value } })} /></label>
      <label>Телефон<input value={invoice.client.phone ?? ""} onChange={(event) => onChange({ ...invoice, client: { ...invoice.client, phone: event.target.value } })} /></label>
      <label>Email<input type="email" value={invoice.client.email ?? ""} onChange={(event) => onChange({ ...invoice, client: { ...invoice.client, email: event.target.value } })} /></label>
    </div>
    <div className="edit-items"><h3>Позиции и размеры</h3>{invoice.items.map((item, itemIndex) => <article key={`${item.productCode}-${itemIndex}`}>
      <div><strong>{products.find((product) => product.code === item.productCode)?.name ?? item.productName}</strong><small>{item.description}</small></div>
      <label>Толщина<select value={item.thicknessCode} onChange={(event) => onChange({ ...invoice, items: invoice.items.map((row, index) => index === itemIndex ? { ...row, thicknessCode: event.target.value } : row) })}>{thicknesses.map((thickness) => <option key={thickness.code} value={thickness.code}>{thickness.label}</option>)}</select></label>
      <label>Количество<input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => onChange({ ...invoice, items: invoice.items.map((row, index) => index === itemIndex ? { ...row, quantity: Number(event.target.value) } : row) })} /></label>
      <div className="dimension-fields">{Object.entries(item.dimensions).map(([key, value]) => <label key={key}>{key}{key === "rail" ? <input value={String(value)} onChange={(event) => updateDimension(itemIndex, key, event.target.value)} /> : <input type="number" min="0.001" step="0.001" value={Number(value)} onChange={(event) => updateDimension(itemIndex, key, Number(event.target.value))} />}</label>)}</div>
    </article>)}</div>
    <button className="primary-button" disabled={busy}>{busy ? "Пересчитываем…" : "Пересчитать и сохранить"}</button>
  </form></div>;
}
