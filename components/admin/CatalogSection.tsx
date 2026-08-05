"use client";

import { useMemo, useState } from "react";
import type { SectionProps } from "./AdminConsole";
import { adminRequest, jsonRequest } from "./admin-api";

type Props = SectionProps & { section: "pricing" | "metal" | "coefficients" };

function SaveBar({ busy, error, onSave }: { busy: boolean; error: string; onSave: () => void }) {
  return <div className="save-bar">{error ? <span className="save-error">{error}</span> : <span>Изменения применятся к новым расчётам сразу после сохранения.</span>}<button className="primary-button" onClick={onSave} disabled={busy}>{busy ? "Сохраняем…" : "Сохранить изменения"}</button></div>;
}

export function CatalogSection({ section, data, onSaved }: Props) {
  const initialRates = useMemo(() => data.products.flatMap((product) => product.rates), [data.products]);
  const [rates, setRates] = useState(initialRates);
  const [metal, setMetal] = useState(data.thicknesses);
  const [coefficients, setCoefficients] = useState(data.coefficients);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (section === "pricing") {
        await adminRequest("/api/admin/settings/pricing", jsonRequest("PUT", { rows: rates.map((rate) => ({ id: rate.id, targetGrossRate: rate.currentGrossRate, materialMultiplier: rate.materialMultiplier })) }));
        await onSaved("Прайс изделий обновлён");
      } else if (section === "metal") {
        await adminRequest("/api/admin/settings/metal", jsonRequest("PUT", { rows: metal.map((item) => ({ id: item.id, costPerSquareMeter: item.costPerSquareMeter })) }));
        await onSaved("Стоимость металла обновлена, прайс пересчитан");
      } else {
        await adminRequest("/api/admin/settings/coefficients", jsonRequest("PUT", { rows: coefficients.map(({ id, value, enabled }) => ({ id, value, enabled })) }));
        await onSaved("Коэффициенты обновлены");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  if (section === "pricing") return <section className="admin-section">
    <div className="admin-heading"><div><p className="admin-kicker">ПРАЙС</p><h1>Цены изделий</h1></div><span>Цена указана за м² с текущим НДС и коэффициентами</span></div>
    <div className="admin-table-wrap"><table className="admin-table pricing-table"><thead><tr><th>Изделие</th><th>Диапазон</th><th>Толщина</th><th>Доля металла</th><th>Цена за м²</th></tr></thead><tbody>
      {rates.map((rate) => <tr key={rate.id}><td><strong>{rate.productName}</strong></td><td>{rate.tierKey === "default" ? "Базовая" : `${rate.minBoundary ?? 0}–${rate.maxBoundary ?? "∞"}`}</td><td>{rate.thicknessCode} мм</td><td><input type="number" step="0.01" min="0" value={rate.materialMultiplier} onChange={(event) => setRates((rows) => rows.map((item) => item.id === rate.id ? { ...item, materialMultiplier: Number(event.target.value) } : item))} /></td><td><div className="money-input"><input type="number" step="0.01" min="0" value={Number(rate.currentGrossRate.toFixed(2))} onChange={(event) => setRates((rows) => rows.map((item) => item.id === rate.id ? { ...item, currentGrossRate: Number(event.target.value) } : item))} /><span>₽</span></div></td></tr>)}
    </tbody></table></div>
    <SaveBar busy={busy} error={error} onSave={save} />
  </section>;

  if (section === "metal") return <section className="admin-section">
    <div className="admin-heading"><div><p className="admin-kicker">СЫРЬЁ</p><h1>Стоимость металла</h1></div><span>Изменение автоматически влияет на все ставки</span></div>
    <div className="setting-cards">
      {metal.map((item) => <article className="setting-card" key={item.id}><div><span>Оцинкованная сталь</span><h2>{item.label}</h2><p>Базовая стоимость на 1 м²</p></div><label>Стоимость<div className="big-money-input"><input type="number" min="0" step="0.01" value={item.costPerSquareMeter} onChange={(event) => setMetal((rows) => rows.map((row) => row.id === item.id ? { ...row, costPerSquareMeter: Number(event.target.value) } : row))} /><span>₽</span></div></label></article>)}
    </div>
    <SaveBar busy={busy} error={error} onSave={save} />
  </section>;

  return <section className="admin-section">
    <div className="admin-heading"><div><p className="admin-kicker">ФОРМУЛА</p><h1>Коэффициенты</h1></div><span>Включённые значения перемножаются автоматически</span></div>
    <div className="coefficient-list">
      {coefficients.map((item) => <article key={item.id}><label className="switch"><input type="checkbox" checked={item.enabled} onChange={(event) => setCoefficients((rows) => rows.map((row) => row.id === item.id ? { ...row, enabled: event.target.checked } : row))} /><i /></label><div><h3>{item.name}</h3><p>{item.key}</p></div><label>Значение<input type="number" min="0" step="0.001" value={item.value} disabled={!item.enabled} onChange={(event) => setCoefficients((rows) => rows.map((row) => row.id === item.id ? { ...row, value: Number(event.target.value) } : row))} /></label><strong>{item.enabled ? `× ${item.value}` : "выкл."}</strong></article>)}
    </div>
    <SaveBar busy={busy} error={error} onSave={save} />
  </section>;
}
