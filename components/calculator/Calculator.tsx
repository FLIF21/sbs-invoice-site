"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { downloadInvoiceExcel } from "@/app/excel-export";
import { calculateQuote } from "@/lib/domain/pricing";
import { formatArea, formatRub } from "@/lib/domain/format";
import type { InvoiceDocument, ProductDimensions, PublicCatalog, QuoteItemInput } from "@/lib/domain/types";
import { downloadInvoicePdf } from "@/lib/client/pdf-export";
import {
  canonicalDateValue,
  dueDateValidationError,
  invoiceDateError,
  issueDateValidationError,
  minimumDueDate,
  todayInMoscow,
} from "@/lib/validation/dates";
import {
  MAX_ANGLE_VALUE,
  MAX_DIMENSION_VALUE,
  MAX_INVOICE_ITEM_QUANTITY,
  parsePositiveDecimal,
  parsePositiveInteger,
} from "@/lib/validation/numeric-input";
import {
  INVOICE_DRAFT_STORAGE_KEY,
  isMeaningfulDraft,
  newIdempotencyKey,
  parseInvoiceDraft,
  serializeInvoiceDraft,
  type ClientDetails,
  type EditableDimensions,
  type EditableItem,
  type InvoiceMeta,
  type NumericValue,
} from "@/lib/client/invoice-draft";

const recentClientsKey = "sbs-recent-clients-v1";
const emptyClient = (): ClientDetails => ({ name: "", inn: "", kpp: "", address: "", phone: "", email: "" });
const emptyMeta = (): InvoiceMeta => ({
  issueDate: todayInMoscow(), dueDate: "", project: "", requestNumber: "", applicant: "", notes: "",
});
type ExportStage = "saving" | "pdf" | "excel" | null;
type FormMessage = { kind: "success" | "error" | "info"; text: string } | null;
type NumericDimensionKey = Exclude<keyof EditableDimensions, "rail">;
type ItemFieldKey = NumericDimensionKey | "quantity";
type ItemValidation = {
  quoteItem: QuoteItemInput | null;
  errors: Partial<Record<ItemFieldKey, string>>;
  message: string;
};

const dimensionLabels: Record<NumericDimensionKey, string> = {
  width: "Ширина A",
  height: "Ширина B",
  width2: "Ширина A₂",
  height2: "Ширина B₂",
  diameter: "Диаметр D",
  length: "Длина L",
  radius: "Радиус R",
  angle: "Угол",
  area: "Площадь единицы",
};

function isClientDetails(value: unknown): value is ClientDetails {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["name", "inn", "kpp", "address", "phone", "email"].every((key) => typeof candidate[key] === "string");
}

function blankDimensions(product: PublicCatalog["products"][number]): EditableDimensions {
  return Object.fromEntries(Object.entries(product.defaultDimensions).map(([key, value]) => [
    key,
    typeof value === "number" ? "" : value,
  ])) as EditableDimensions;
}

function makeItem(catalog: PublicCatalog, id: number, productCode?: string): EditableItem {
  const defaultProduct = catalog.products.find((candidate) => candidate.code === "duct")
    ?? catalog.products.find((candidate) => candidate.calculationMethod === "RECTANGULAR_DUCT")
    ?? catalog.products[0];
  const product = catalog.products.find((candidate) => candidate.code === productCode) ?? defaultProduct;
  if (!product || !catalog.thicknesses[0]) throw new Error("Прайс не настроен");
  return {
    id,
    productCode: product.code,
    thicknessCode: catalog.thicknesses[0].code,
    quantity: 1,
    dimensions: blankDimensions(product),
  };
}

function requiredDimensions(product: PublicCatalog["products"][number]): NumericDimensionKey[] {
  switch (product.calculationMethod) {
    case "RECTANGULAR_ELBOW": return ["width", "height", "angle", "radius"];
    case "RECTANGULAR_TRANSITION": return typeof product.defaultDimensions.diameter === "number"
      ? ["width", "height", "diameter", "length"]
      : ["width", "height", "width2", "height2", "length"];
    case "ROUND_DAMPER": return ["width", "length"];
    case "RECTANGULAR_DAMPER": return ["width", "height", "length"];
    case "CUSTOM_AREA": return ["area"];
    default: return ["width", "height", "length"];
  }
}

function validateItem(item: EditableItem, product: PublicCatalog["products"][number]): ItemValidation {
  const errors: ItemValidation["errors"] = {};
  const dimensions: ProductDimensions = {};
  let missingDimension = false;
  for (const key of requiredDimensions(product)) {
    const result = parsePositiveDecimal(item.dimensions[key], dimensionLabels[key]);
    const maximum = key === "angle" ? MAX_ANGLE_VALUE : MAX_DIMENSION_VALUE;
    if (result.success && result.value <= maximum) dimensions[key] = result.value;
    else if (result.success) errors[key] = `${dimensionLabels[key]}: значение не должно превышать ${maximum.toLocaleString("ru-RU")}`;
    else {
      errors[key] = result.error;
      missingDimension ||= result.missing;
    }
  }
  if (item.dimensions.rail) dimensions.rail = item.dimensions.rail;
  const quantity = parsePositiveInteger(item.quantity);
  if (!quantity.success) errors.quantity = quantity.error;
  else if (quantity.value > MAX_INVOICE_ITEM_QUANTITY) errors.quantity = "Количество не должно превышать 1 000 000 000";
  const specificError = Object.values(errors).find((error) => !error.endsWith(": заполните поле"));
  const message = specificError ?? (missingDimension ? "Заполните размеры изделия" : errors.quantity ?? "");
  return {
    quoteItem: Object.keys(errors).length === 0 && quantity.success ? {
      productCode: item.productCode,
      thicknessCode: item.thicknessCode,
      quantity: quantity.value,
      dimensions,
    } : null,
    errors,
    message,
  };
}

function visibleFieldError(error?: string) {
  return error?.endsWith(": заполните поле") ? undefined : error;
}

function NumberField({ id, label, value, onChange, error, integer = false }: {
  id: string;
  label: string;
  value?: NumericValue;
  onChange: (value: NumericValue) => void;
  error?: string;
  integer?: boolean;
}) {
  const errorId = `${id}-error`;
  return <label htmlFor={id}>{label}<input
    id={id}
    type="text"
    inputMode={integer ? "numeric" : "decimal"}
    pattern={integer ? "[0-9]*" : "[0-9]+([.,][0-9]+)?"}
    enterKeyHint="next"
    aria-invalid={Boolean(error)}
    aria-describedby={error ? errorId : undefined}
    value={value ?? ""}
    onChange={(event) => onChange(event.target.value)}
  />{error && <small className="field-error" id={errorId} role="alert">{error}</small>}</label>;
}

function DateField({ id, label, value, min, error, onChange }: {
  id: string;
  label: string;
  value: string;
  min: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const errorId = `${id}-error`;
  const lastEmittedValue = useRef(value);
  useEffect(() => { lastEmittedValue.current = value; }, [value]);
  const handleValue = (nextValue: string) => {
    const canonicalValue = canonicalDateValue(nextValue);
    if (lastEmittedValue.current === canonicalValue) return;
    lastEmittedValue.current = canonicalValue;
    onChange(canonicalValue);
  };
  return <label htmlFor={id}>{label}<input
    id={id}
    type="date"
    min={min}
    value={value}
    aria-invalid={Boolean(error)}
    aria-describedby={error ? errorId : undefined}
    onInput={(event) => handleValue(event.currentTarget.value)}
    onChange={(event) => handleValue(event.currentTarget.value)}
  />{error && <small className="field-error" id={errorId} role="alert">{error}</small>}</label>;
}

export function Calculator({ initialCatalog }: { initialCatalog: PublicCatalog }) {
  const [items, setItems] = useState<EditableItem[]>(() => [makeItem(initialCatalog, 1)]);
  const [meta, setMeta] = useState<InvoiceMeta>(emptyMeta);
  const [client, setClient] = useState<ClientDetails>(emptyClient);
  const [recentClients, setRecentClients] = useState<ClientDetails[]>([]);
  const [savedInvoice, setSavedInvoice] = useState<InvoiceDocument | null>(null);
  const [exportStage, setExportStage] = useState<ExportStage>(null);
  const [message, setMessage] = useState<FormMessage>(null);
  const [draftReady, setDraftReady] = useState(false);
  const idempotencyKeyRef = useRef(newIdempotencyKey());
  const exportLockRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem(recentClientsKey) ?? "[]") as unknown;
        if (Array.isArray(stored)) setRecentClients(stored.filter(isClientDetails).slice(0, 12));
      } catch {
        localStorage.removeItem(recentClientsKey);
      }
      const rawDraft = sessionStorage.getItem(INVOICE_DRAFT_STORAGE_KEY);
      const draft = parseInvoiceDraft(rawDraft, initialCatalog);
      if (draft) {
        idempotencyKeyRef.current = draft.idempotencyKey;
        setMeta(draft.meta);
        setClient(draft.client);
        setItems(draft.items);
        setSavedInvoice(draft.savedInvoice);
        setMessage({ kind: "info", text: draft.savedInvoice ? `Восстановлен счёт № ${draft.savedInvoice.number}` : "Черновик восстановлен" });
      } else if (rawDraft) {
        sessionStorage.removeItem(INVOICE_DRAFT_STORAGE_KEY);
        setMessage({ kind: "error", text: "Повреждённый черновик удалён. Начат новый счёт." });
      }
      setDraftReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialCatalog]);

  useLayoutEffect(() => {
    if (!draftReady) return;
    try {
      sessionStorage.setItem(INVOICE_DRAFT_STORAGE_KEY, serializeInvoiceDraft({
        idempotencyKey: idempotencyKeyRef.current, meta, client, items, savedInvoice,
      }));
    } catch {
      window.setTimeout(() => setMessage({ kind: "error", text: "Не удалось сохранить черновик в браузере. Не закрывайте страницу до завершения работы." }), 0);
    }
  }, [client, draftReady, items, meta, savedInvoice]);

  const itemValidations = useMemo(() => items.map((item) => {
    const product = initialCatalog.products.find((candidate) => candidate.code === item.productCode);
    if (!product) return { quoteItem: null, errors: {}, message: "Выбранное изделие больше недоступно" } satisfies ItemValidation;
    return validateItem(item, product);
  }), [items, initialCatalog]);

  const calculation = useMemo(() => {
    const validationError = itemValidations.find((validation) => validation.message)?.message ?? "";
    const quoteItems = itemValidations.map((validation) => validation.quoteItem);
    if (validationError || quoteItems.some((item) => !item)) {
      return {
        quote: { lines: [], subtotal: 0, taxAmount: 0, total: 0, tax: initialCatalog.tax },
        error: validationError || "Заполните размеры изделия",
      };
    }
    try {
      return { quote: calculateQuote(quoteItems as QuoteItemInput[], initialCatalog), error: "" };
    } catch (error) {
      return {
        quote: { lines: [], subtotal: 0, taxAmount: 0, total: 0, tax: initialCatalog.tax },
        error: error instanceof Error ? error.message : "Проверьте размеры",
      };
    }
  }, [itemValidations, initialCatalog]);

  const today = todayInMoscow();
  const dateError = invoiceDateError(meta.issueDate, meta.dueDate, today);
  const issueDateError = issueDateValidationError(meta.issueDate, today);
  const dueDateError = dueDateValidationError(meta.issueDate, meta.dueDate, today);
  const dueDateMin = minimumDueDate(meta.issueDate, today);
  const clientError = client.name.trim().length < 2 ? "Укажите название покупателя" : "";
  const clientFieldError = calculation.error ? "" : clientError;
  const formError = calculation.error || dateError || clientError;
  const canExport = !formError
    && calculation.quote.lines.length === items.length
    && calculation.quote.total > 0;

  const invalidate = () => {
    idempotencyKeyRef.current = newIdempotencyKey();
    setSavedInvoice(null);
    setMessage(null);
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
    if (!canExport) throw new Error(formError || "Заполните обязательные поля");
    if (savedInvoice) return savedInvoice;
    setExportStage("saving");
    const response = await fetch("/api/public/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: idempotencyKeyRef.current,
        ...meta,
        client,
        items: itemValidations.map((validation) => validation.quoteItem),
      }),
    });
    const result = await response.json() as InvoiceDocument & { error?: string };
    if (!response.ok) throw new Error(result.error || "Не удалось сформировать счёт");
    rememberClient();
    setSavedInvoice(result);
    try {
      sessionStorage.setItem(INVOICE_DRAFT_STORAGE_KEY, serializeInvoiceDraft({
        idempotencyKey: idempotencyKeyRef.current, meta, client, items, savedInvoice: result,
      }));
    } catch { /* The invoice is already safe on the server; the UI will show storage failures through autosave. */ }
    return result;
  }

  function exportInvoice(format: "pdf" | "excel") {
    if (exportLockRef.current) return exportLockRef.current;
    const operation = (async () => {
      setMessage(null);
      try {
        const invoice = await ensureInvoice();
        setExportStage(format);
        if (format === "pdf") await downloadInvoicePdf(invoice);
        else await downloadInvoiceExcel(invoice);
        setMessage({ kind: "success", text: `${format === "pdf" ? "PDF" : "Excel"} скачан. Счёт № ${invoice.number}` });
      } catch (error) {
        setMessage({ kind: "error", text: error instanceof Error ? error.message : "Не удалось сформировать файл. Повторите попытку." });
      } finally {
        setExportStage(null);
      }
    })();
    exportLockRef.current = operation;
    void operation.finally(() => {
      if (exportLockRef.current === operation) exportLockRef.current = null;
    });
    return operation;
  }

  function newInvoice() {
    const defaultItem = makeItem(initialCatalog, 1);
    if (isMeaningfulDraft(meta, client, items, defaultItem, savedInvoice)
      && !window.confirm("Очистить заполненный черновик и начать новый счёт?")) return;
    sessionStorage.removeItem(INVOICE_DRAFT_STORAGE_KEY);
    idempotencyKeyRef.current = newIdempotencyKey();
    setMeta(emptyMeta());
    setClient(emptyClient());
    setItems([defaultItem]);
    setSavedInvoice(null);
    setMessage({ kind: "info", text: "Начат новый счёт" });
  }

  const exportLabel = (format: "pdf" | "excel", compact = false) => {
    if (exportStage === "saving") return "Сохраняем счёт…";
    if (exportStage === format) return `Формируем ${format === "pdf" ? "PDF" : "Excel"}…`;
    return compact ? `Скачать ${format === "pdf" ? "PDF" : "Excel"}` : `Скачать счёт в ${format === "pdf" ? "PDF" : "Excel"}`;
  };

  return <main className="public-site">
    <header className="topbar">
      <div><span className="mark">СБС</span><span className="brand">Счёт</span></div>
      <div className="topbar-actions">
        <div className="status"><i /> Прайс обновлён {new Date(initialCatalog.pricesUpdatedAt).toLocaleDateString("ru-RU")}</div>
        <button className="new-invoice-button" type="button" onClick={newInvoice} disabled={Boolean(exportStage)}>Новый счёт</button>
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
        <span>К оплате</span><strong>{formatRub(calculation.quote.total)}</strong>
        <small>{initialCatalog.tax.enabled ? `включая НДС ${initialCatalog.tax.rate}%` : "без НДС"} · {items.length} поз.</small>
        <div className="export-actions">
          <button onClick={() => exportInvoice("pdf")} disabled={!canExport || Boolean(exportStage)}>{exportLabel("pdf", true)} <b>↗</b></button>
          <button onClick={() => exportInvoice("excel")} disabled={!canExport || Boolean(exportStage)}>{exportLabel("excel", true)} <b>↗</b></button>
        </div>
      </div>
    </section>

    <section className="workspace">
      <div className="panel">
        <div className="section-title"><span>01</span><div><h2>Данные счёта</h2><p>Номер присваивается автоматически при первом скачивании</p></div></div>
        <div className="form-grid">
          <label>Номер счёта<input value={savedInvoice?.number ?? "Будет присвоен после сохранения"} readOnly /></label>
          <DateField id="invoice-issue-date" label="Дата" min={today} value={meta.issueDate} error={issueDateError} onChange={(issueDate) => updateMeta({ issueDate })} />
          <label>Проект<input placeholder="Название или шифр" value={meta.project} onChange={(event) => updateMeta({ project: event.target.value })} /></label>
          <label>№ заявки<input placeholder="Например, 260166" value={meta.requestNumber} onChange={(event) => updateMeta({ requestNumber: event.target.value })} /></label>
          <label className="wide">Покупатель<input list="recent-client-names" autoComplete="organization" placeholder="Название организации" aria-invalid={Boolean(clientFieldError)} value={client.name} onChange={(event) => updateClientFromSuggestion("name", event.target.value)} />{recentClients.length > 0 && <small className="field-hint">Выберите ранее сохранённые реквизиты из подсказки</small>}{clientFieldError && <small className="field-error" role="alert">{clientFieldError}</small>}</label>
          <label>ИНН<input list="recent-client-inns" inputMode="numeric" value={client.inn} onChange={(event) => updateClientFromSuggestion("inn", event.target.value)} /></label>
          <label>КПП<input inputMode="numeric" value={client.kpp} onChange={(event) => updateClient({ kpp: event.target.value })} /></label>
          <label className="wide">Адрес<input value={client.address} onChange={(event) => updateClient({ address: event.target.value })} /></label>
          <label>Телефон<input type="tel" value={client.phone} onChange={(event) => updateClient({ phone: event.target.value })} /></label>
          <label>Email<input type="email" value={client.email} onChange={(event) => updateClient({ email: event.target.value })} /></label>
          <label>Заявитель<input placeholder="ФИО" value={meta.applicant} onChange={(event) => updateMeta({ applicant: event.target.value })} /></label>
          <DateField id="invoice-due-date" label="Требуется к" min={dueDateMin} value={meta.dueDate} error={dueDateError} onChange={(dueDate) => updateMeta({ dueDate })} />
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
          const validation = itemValidations[index];
          return <article className="product" key={item.id}>
            <div className="product-head"><b>{String(index + 1).padStart(2, "0")}</b>
              <label className="product-type-label" htmlFor={`item-${item.id}-product-type`}><span>Тип изделия</span><span className="product-select-wrap"><select id={`item-${item.id}-product-type`} value={item.productCode} onChange={(event) => {
                const nextProduct = initialCatalog.products.find((candidate) => candidate.code === event.target.value)!;
                updateItem(item.id, { productCode: nextProduct.code, dimensions: blankDimensions(nextProduct) });
              }}>
                {initialCatalog.products.map((candidate) => <option key={candidate.code} value={candidate.code}>{candidate.name}</option>)}
              </select><span className="selected-product-name" aria-hidden="true">{product.name}</span></span></label>
              <button className="remove" type="button" aria-label={`Удалить позицию ${index + 1}`} disabled={items.length === 1} title={items.length === 1 ? "В счёте должна остаться хотя бы одна позиция" : "Удалить позицию"} onClick={() => {
                if (items.length > 1) { invalidate(); setItems((current) => current.filter((candidate) => candidate.id !== item.id)); }
              }}>×</button>
            </div>
            <div className="product-body">
              <figure className="product-photo">
                {product.imagePath && <Image src={product.imagePath} alt={product.name} width={960} height={640} loading="eager" unoptimized />}
              </figure>
              <div className="item-grid">
                {isCustom
                  ? <NumberField id={`item-${item.id}-area`} label="Площадь единицы, м²" value={item.dimensions.area} error={visibleFieldError(validation?.errors.area)} onChange={(value) => updateDimension(item.id, "area", value)} />
                  : <NumberField id={`item-${item.id}-width`} label={method === "ROUND_DAMPER" ? "Диаметр D, мм" : "Ширина A, мм"} value={item.dimensions.width} error={visibleFieldError(validation?.errors.width)} onChange={(value) => updateDimension(item.id, "width", value)} />}
                {hasHeight && <NumberField id={`item-${item.id}-height`} label="Ширина B, мм" value={item.dimensions.height} error={visibleFieldError(validation?.errors.height)} onChange={(value) => updateDimension(item.id, "height", value)} />}
                {isRectangularTransition && <>
                  <NumberField id={`item-${item.id}-width2`} label="Ширина A₂, мм" value={item.dimensions.width2} error={visibleFieldError(validation?.errors.width2)} onChange={(value) => updateDimension(item.id, "width2", value)} />
                  <NumberField id={`item-${item.id}-height2`} label="Ширина B₂, мм" value={item.dimensions.height2} error={visibleFieldError(validation?.errors.height2)} onChange={(value) => updateDimension(item.id, "height2", value)} />
                </>}
                {isRoundTransition && <NumberField id={`item-${item.id}-diameter`} label="Диаметр D, мм" value={item.dimensions.diameter} error={visibleFieldError(validation?.errors.diameter)} onChange={(value) => updateDimension(item.id, "diameter", value)} />}
                {!isElbow && !isCustom && <NumberField id={`item-${item.id}-length`} label="Длина L, мм" value={item.dimensions.length} error={visibleFieldError(validation?.errors.length)} onChange={(value) => updateDimension(item.id, "length", value)} />}
                {isElbow && <>
                  <NumberField id={`item-${item.id}-angle`} label="Угол, °" value={item.dimensions.angle} error={visibleFieldError(validation?.errors.angle)} onChange={(value) => updateDimension(item.id, "angle", value)} />
                  <NumberField id={`item-${item.id}-radius`} label="Радиус R, мм" value={item.dimensions.radius} error={visibleFieldError(validation?.errors.radius)} onChange={(value) => updateDimension(item.id, "radius", value)} />
                </>}
                <label>Толщина<select value={item.thicknessCode} onChange={(event) => updateItem(item.id, { thicknessCode: event.target.value })}>
                  {initialCatalog.thicknesses.map((thickness) => <option key={thickness.code} value={thickness.code}>{thickness.label}</option>)}
                </select></label>
                {!method.includes("DAMPER") && !isCustom && <label>Шинорейка<select value={item.dimensions.rail ?? "20/20"} onChange={(event) => updateDimension(item.id, "rail", event.target.value)}><option>20/20</option><option>30/30</option></select></label>}
                <NumberField id={`item-${item.id}-quantity`} label="Количество" integer value={item.quantity} error={visibleFieldError(validation?.errors.quantity)} onChange={(value) => updateItem(item.id, { quantity: value })} />
              </div>
            </div>
            <div className="line-total"><span>{line?.description ?? "Заполните размеры изделия"}</span><small>{line ? `≈ ${formatArea(line.area)} м² × ${formatRub(line.grossUnitPrice)}` : "—"}</small><strong>{formatRub(line?.grossTotal ?? 0)}</strong></div>
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
        <div><span>Общая площадь</span><b>{calculation.quote.lines.length ? `${formatArea(calculation.quote.lines.reduce((sum, line) => sum + line.area, 0))} м²` : "—"}</b></div>
        <div><span>Без НДС</span><b>{formatRub(calculation.quote.subtotal)}</b></div>
        <div><span>{initialCatalog.tax.enabled ? `НДС ${initialCatalog.tax.rate}%` : "НДС отключён"}</span><b>{formatRub(calculation.quote.taxAmount)}</b></div>
        <div className="grand"><span>Итого</span><b>{formatRub(calculation.quote.total)}</b></div>
        {formError && <div className="form-message error">{formError}</div>}
        {message?.kind === "error" && <div className="form-message error" role="alert">{message.text}</div>}
        <div className="system-status" role="status" aria-live="polite" aria-atomic="true">
          {message && message.kind !== "error" && <div className={`form-message ${message.kind}`}>{message.text}</div>}
        </div>
        <div className="export-actions">
          <button onClick={() => exportInvoice("pdf")} disabled={!canExport || Boolean(exportStage)}>{exportLabel("pdf")}</button>
          <button onClick={() => exportInvoice("excel")} disabled={!canExport || Boolean(exportStage)}>{exportLabel("excel")}</button>
        </div>
        <small>При первом скачивании счёт сохраняется в системе. Повторное скачивание не создаёт новый номер, пока данные не изменены.</small>
      </aside>
    </section>
    <footer>производство воздуховодов <span>{initialCatalog.company.legalName}</span></footer>
  </main>;
}
