"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { downloadInvoiceExcel } from "@/app/excel-export";
import { calculateQuote } from "@/lib/domain/pricing";
import type { InvoiceDocument, ProductDimensions, PublicCatalog, QuoteItemInput } from "@/lib/domain/types";
import { downloadInvoicePdf } from "@/lib/client/pdf-export";

type NumericValue = number | string;
type EditableDimensions = Omit<ProductDimensions, "width" | "height" | "width2" | "height2" | "diameter" | "length" | "radius" | "angle" | "area"> & {
  width?: NumericValue;
  height?: NumericValue;
  width2?: NumericValue;
  height2?: NumericValue;
  diameter?: NumericValue;
  length?: NumericValue;
  radius?: NumericValue;
  angle?: NumericValue;
  area?: NumericValue;
};
type EditableItem = { id: number; productCode: string; thicknessCode: string; quantity: NumericValue; dimensions: EditableDimensions };
type ClientDetails = { name: string; inn: string; kpp: string; address: string; phone: string; email: string };

const rub = (value: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(value);
const num = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value);
const numericInput = (value: string): NumericValue => value.replace(",", ".");
const recentClientsKey = "sbs-recent-clients-v1";

function isClientDetails(value: unknown): value is ClientDetails {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["name", "inn", "kpp", "address", "phone", "email"].every((key) => typeof candidate[key] === "string");
}

function makeItem(catalog: PublicCatalog, id: number, productCode = catalog.products[0]?.code): EditableItem {
  const product = catalog.products.find((candidate) => candidate.code === productCode) ?? catalog.products[0];
  if (!product || !catalog.thicknesses[0]) throw new Error("Прайс не настроен");
  return {
    id,
    productCode: product.code,
    thicknessCode: catalog.thicknesses[0].code,
    quantity: 1,
    dimensions: { ...product.defaultDimensions },
  };
}

function toQuoteItem(item: EditableItem): QuoteItemInput {
  const dimensions = Object.fromEntries(
    Object.entries(item.dimensions)
      .filter(([, value]) => value !== "")
      .map(([key, value]) => [key, key === "rail" ? value : Number(value)]),
  ) as ProductDimensions;
  return {
    productCode: item.productCode,
    thicknessCode: item.thicknessCode,
    quantity: Number(item.quantity),
    dimensions,
  };
}

function NumberField({ label, value, onChange, min }: { label: string; value?: NumericValue; onChange: (value: NumericValue) => void; min?: number }) {
  return <label>{label}<input
    type="text"
    inputMode="decimal"
    data-min={min}
    value={value ?? ""}
    onChange={(event) => {
      const next = numericInput(event.target.value);
      if (/^\d*(?:\.\d*)?$/.test(String(next))) onChange(next);
    }}
  /></label>;
}

export function Calculator({ initialCatalog }: { initialCatalog: PublicCatalog }) {
  const [items, setItems] = useState<EditableItem[]>(() => [makeItem(initialCatalog, 1)]);
  const [meta, setMeta] = useState({
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    project: "",
    requestNumber: "",
    applicant: "",
    notes: "",
  });
  const [client, setClient] = useState<ClientDetails>({ name: "", inn: "", kpp: "", address: "", phone: "", email: "" });
  const [recentClients, setRecentClients] = useState<ClientDetails[]>([]);
  const [savedInvoice, setSavedInvoice] = useState<InvoiceDocument | null>(null);
  const [busy, setBusy] = useState<"pdf" | "excel" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem(recentClientsKey) ?? "[]") as unknown;
        if (Array.isArray(stored)) setRecentClients(stored.filter(isClientDetails).slice(0, 12));
      } catch {
        localStorage.removeItem(recentClientsKey);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const calculation = useMemo(() => {
    try {
      return { quote: calculateQuote(items.map(toQuoteItem), initialCatalog), error: "" };
    } catch (error) {
      return {
        quote: { lines: [], subtotal: 0, taxAmount: 0, total: 0, tax: initialCatalog.tax },
        error: error instanceof Error ? error.message : "Проверьте размеры",
      };
    }
  }, [items, initialCatalog]);

  const invalidate = () => {
    setSavedInvoice(null);
    setMessage("");
  };
  const updateMeta = (patch: Partial<typeof meta>) => { invalidate(); setMeta((current) => ({ ...current, ...patch })); };
  const updateClient = (patch: Partial<typeof client>) => { invalidate(); setClient((current) => ({ ...current, ...patch })); };
  const updateClientFromSuggestion = (field: "name" | "inn", value: string) => {
    const normalized = value.trim().toLocaleLowerCase("ru-RU");
    const saved = recentClients.find((item) => item[field].trim().toLocaleLowerCase("ru-RU") === normalized);
    updateClient(saved ?? { [field]: value });
  };
  const rememberClient = () => {
    const saved = Object.fromEntries(Object.entries(client).map(([key, value]) => [key, value.trim()])) as ClientDetails;
    const identity = saved.inn || saved.name.toLocaleLowerCase("ru-RU");
    setRecentClients((current) => {
      const next = [saved, ...current.filter((item) => (item.inn || item.name.toLocaleLowerCase("ru-RU")) !== identity)].slice(0, 12);
      try { localStorage.setItem(recentClientsKey, JSON.stringify(next)); } catch { /* Storage may be unavailable in private mode. */ }
      return next;
    });
  };
  const updateItem = (id: number, patch: Partial<EditableItem>) => {
    invalidate();
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };
  const updateDimension = (id: number, key: keyof EditableDimensions, value: NumericValue | string) => {
    invalidate();
    setItems((current) => current.map((item) => item.id === id
      ? { ...item, dimensions: { ...item.dimensions, [key]: value } }
      : item));
  };

  async function ensureInvoice() {
    if (savedInvoice) return savedInvoice;
    if (calculation.error) throw new Error(calculation.error);
    if (!client.name.trim()) throw new Error("Укажите название покупателя");
    const response = await fetch("/api/public/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...meta, client, items: items.map(toQuoteItem) }),
    });
    const result = await response.json() as InvoiceDocument & { error?: string };
    if (!response.ok) throw new Error(result.error || "Не удалось сформировать счёт");
    rememberClient();
    setSavedInvoice(result);
    setMessage(`Счёт № ${result.number} сохранён`);
    return result;
  }

  async function exportInvoice(format: "pdf" | "excel") {
    setBusy(format);
    setMessage("");
    try {
      const invoice = await ensureInvoice();
      if (format === "pdf") await downloadInvoicePdf(invoice);
      else await downloadInvoiceExcel(invoice);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сформировать файл");
    } finally {
      setBusy(null);
    }
  }

  return <main className="public-site">
    <header className="topbar">
      <div><span className="mark">СБС</span><span className="brand">Счёт</span></div>
      <div className="topbar-actions">
        <div className="status"><i /> Прайс обновлён {new Date(initialCatalog.pricesUpdatedAt).toLocaleDateString("ru-RU")}</div>
        <Link className="admin-link" href="/admin">Войти</Link>
      </div>
    </header>

    <section className="hero">
      <div>
        <p className="eyebrow">КАЛЬКУЛЯТОР ВОЗДУХОВОДОВ</p>
        <h1>Счёт, который<br />считает себя сам.</h1>
        <p className="lead">Заполните реквизиты, добавьте изделия — площадь, цена и итог пересчитаются автоматически.</p>
      </div>
      <div className="total-card">
        <span>К оплате</span><strong>{rub(calculation.quote.total)}</strong>
        <small>{initialCatalog.tax.enabled ? `включая НДС ${initialCatalog.tax.rate}%` : "без НДС"} · {items.length} поз.</small>
        <div className="export-actions">
          <button onClick={() => exportInvoice("pdf")} disabled={Boolean(busy)}>{busy === "pdf" ? "Формируем…" : "Скачать PDF"} <b>↗</b></button>
          <button onClick={() => exportInvoice("excel")} disabled={Boolean(busy)}>{busy === "excel" ? "Формируем…" : "Скачать Excel"} <b>↗</b></button>
        </div>
      </div>
    </section>

    <section className="workspace">
      <div className="panel">
        <div className="section-title"><span>01</span><div><h2>Данные счёта</h2><p>Номер присваивается автоматически при первом скачивании</p></div></div>
        <div className="form-grid">
          <label>Следующий номер<input value={savedInvoice?.number ?? initialCatalog.invoiceNumberPreview} readOnly /></label>
          <label>Дата<input type="date" value={meta.issueDate} onChange={(event) => updateMeta({ issueDate: event.target.value })} /></label>
          <label>Проект<input placeholder="Название или шифр" value={meta.project} onChange={(event) => updateMeta({ project: event.target.value })} /></label>
          <label>№ заявки<input placeholder="Например, 260166" value={meta.requestNumber} onChange={(event) => updateMeta({ requestNumber: event.target.value })} /></label>
          <label className="wide">Покупатель<input list="recent-client-names" autoComplete="organization" placeholder="Название организации" value={client.name} onChange={(event) => updateClientFromSuggestion("name", event.target.value)} />{recentClients.length > 0 && <small className="field-hint">Выберите ранее сохранённые реквизиты из подсказки</small>}</label>
          <label>ИНН<input list="recent-client-inns" inputMode="numeric" value={client.inn} onChange={(event) => updateClientFromSuggestion("inn", event.target.value)} /></label>
          <label>КПП<input inputMode="numeric" value={client.kpp} onChange={(event) => updateClient({ kpp: event.target.value })} /></label>
          <label className="wide">Адрес<input value={client.address} onChange={(event) => updateClient({ address: event.target.value })} /></label>
          <label>Телефон<input type="tel" value={client.phone} onChange={(event) => updateClient({ phone: event.target.value })} /></label>
          <label>Email<input type="email" value={client.email} onChange={(event) => updateClient({ email: event.target.value })} /></label>
          <label>Заявитель<input placeholder="ФИО" value={meta.applicant} onChange={(event) => updateMeta({ applicant: event.target.value })} /></label>
          <label>Требуется к<input type="date" value={meta.dueDate} onChange={(event) => updateMeta({ dueDate: event.target.value })} /></label>
          <datalist id="recent-client-names">{recentClients.map((item) => <option key={`${item.inn}-${item.name}`} value={item.name}>{item.inn ? `ИНН ${item.inn}` : item.address}</option>)}</datalist>
          <datalist id="recent-client-inns">{recentClients.filter((item) => item.inn).map((item) => <option key={`${item.inn}-${item.name}`} value={item.inn}>{item.name}</option>)}</datalist>
        </div>
      </div>

      <div className="panel products">
        <div className="section-title"><span>02</span><div><h2>Изделия</h2><p>Ставки и коэффициенты загружаются из базы данных</p></div></div>
        {items.map((item, index) => {
          const product = initialCatalog.products.find((candidate) => candidate.code === item.productCode)!;
          const method = product.calculationMethod;
          const line = calculation.quote.lines[index];
          const hasHeight = method !== "ROUND_DAMPER" && method !== "CUSTOM_AREA";
          const isRoundTransition = method === "RECTANGULAR_TRANSITION" && typeof product.defaultDimensions.diameter === "number";
          const isRectangularTransition = method === "RECTANGULAR_TRANSITION" && !isRoundTransition;
          const isElbow = method === "RECTANGULAR_ELBOW";
          const isCustom = method === "CUSTOM_AREA";
          return <article className="product" key={item.id}>
            <div className="product-head"><b>{String(index + 1).padStart(2, "0")}</b>
              <select value={item.productCode} onChange={(event) => {
                const nextProduct = initialCatalog.products.find((candidate) => candidate.code === event.target.value)!;
                updateItem(item.id, { productCode: nextProduct.code, dimensions: { ...nextProduct.defaultDimensions } });
              }}>
                {initialCatalog.products.map((candidate) => <option key={candidate.code} value={candidate.code}>{candidate.name}</option>)}
              </select>
              <button className="remove" type="button" aria-label="Удалить позицию" onClick={() => {
                if (items.length > 1) { invalidate(); setItems((current) => current.filter((candidate) => candidate.id !== item.id)); }
              }}>×</button>
            </div>
            <div className="product-body">
              <figure className="product-photo">
                {product.imagePath && <Image src={product.imagePath} alt={product.name} width={960} height={640} loading="eager" unoptimized />}
                <figcaption>{product.name}</figcaption>
              </figure>
              <div className="item-grid">
                {isCustom
                  ? <NumberField label="Площадь единицы, м²" value={item.dimensions.area} onChange={(value) => updateDimension(item.id, "area", value)} />
                  : <NumberField label={method === "ROUND_DAMPER" ? "Диаметр D, мм" : "Ширина A, мм"} value={item.dimensions.width} onChange={(value) => updateDimension(item.id, "width", value)} />}
                {hasHeight && <NumberField label="Ширина B, мм" value={item.dimensions.height} onChange={(value) => updateDimension(item.id, "height", value)} />}
                {isRectangularTransition && <>
                  <NumberField label="Ширина A₂, мм" value={item.dimensions.width2} onChange={(value) => updateDimension(item.id, "width2", value)} />
                  <NumberField label="Ширина B₂, мм" value={item.dimensions.height2} onChange={(value) => updateDimension(item.id, "height2", value)} />
                </>}
                {isRoundTransition && <NumberField label="Диаметр D, мм" value={item.dimensions.diameter} onChange={(value) => updateDimension(item.id, "diameter", value)} />}
                {!isElbow && !isCustom && <NumberField label="Длина L, мм" value={item.dimensions.length} onChange={(value) => updateDimension(item.id, "length", value)} />}
                {isElbow && <>
                  <NumberField label="Угол, °" value={item.dimensions.angle} onChange={(value) => updateDimension(item.id, "angle", value)} />
                  <NumberField label="Радиус R, мм" value={item.dimensions.radius} onChange={(value) => updateDimension(item.id, "radius", value)} />
                </>}
                <label>Толщина<select value={item.thicknessCode} onChange={(event) => updateItem(item.id, { thicknessCode: event.target.value })}>
                  {initialCatalog.thicknesses.map((thickness) => <option key={thickness.code} value={thickness.code}>{thickness.label}</option>)}
                </select></label>
                {!method.includes("DAMPER") && !isCustom && <label>Шинорейка<select value={item.dimensions.rail ?? "20/20"} onChange={(event) => updateDimension(item.id, "rail", event.target.value)}><option>20/20</option><option>30/30</option></select></label>}
                <NumberField label="Количество" min={1} value={item.quantity} onChange={(value) => updateItem(item.id, { quantity: value })} />
              </div>
            </div>
            <div className="line-total"><span>{line?.description ?? "Заполните размеры"}</span><small>{line ? `${num(line.area)} м² × ${rub(line.grossUnitPrice)}` : "—"}</small><strong>{rub(line?.grossTotal ?? 0)}</strong></div>
          </article>;
        })}
        <button className="add" type="button" onClick={() => {
          invalidate();
          setItems((current) => [...current, makeItem(initialCatalog, Math.max(...current.map((item) => item.id)) + 1)]);
        }}>＋ Добавить изделие</button>
      </div>

      <aside className="summary">
        <p>Сводка</p>
        <div><span>Позиций</span><b>{items.length}</b></div>
        <div><span>Общая площадь</span><b>{num(calculation.quote.lines.reduce((sum, line) => sum + line.area, 0))} м²</b></div>
        <div><span>Без НДС</span><b>{rub(calculation.quote.subtotal)}</b></div>
        <div><span>{initialCatalog.tax.enabled ? `НДС ${initialCatalog.tax.rate}%` : "НДС отключён"}</span><b>{rub(calculation.quote.taxAmount)}</b></div>
        <div className="grand"><span>Итого</span><b>{rub(calculation.quote.total)}</b></div>
        {(calculation.error || message) && <div className={`form-message ${calculation.error ? "error" : ""}`}>{calculation.error || message}</div>}
        <div className="export-actions">
          <button onClick={() => exportInvoice("pdf")} disabled={Boolean(busy)}>Скачать счёт в PDF</button>
          <button onClick={() => exportInvoice("excel")} disabled={Boolean(busy)}>{busy === "excel" ? "Формируем Excel…" : "Скачать счёт в Excel"}</button>
        </div>
        <small>При первом скачивании счёт сохраняется в системе. Повторное скачивание не создаёт новый номер, пока данные не изменены.</small>
      </aside>
    </section>
    <footer>производство воздуховодов <span>{initialCatalog.company.legalName}</span></footer>
  </main>;
}
