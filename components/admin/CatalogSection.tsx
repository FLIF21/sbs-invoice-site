"use client";

import { useMemo, useState } from "react";
import { productFormulas, type ProductFormulaKey } from "@/lib/domain/product-formulas";
import type { SectionProps } from "./AdminConsole";
import { adminRequest, jsonRequest } from "./admin-api";

type Props = SectionProps & { section: "pricing" | "metal" | "coefficients" };
type NewProductDraft = {
  code: string;
  name: string;
  category: string;
  formulaKey: ProductFormulaKey;
  rates: Array<{ thicknessId: string; thicknessLabel: string; targetGrossRate: string; materialMultiplier: string }>;
};

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
  const [newProduct, setNewProduct] = useState<NewProductDraft | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  function openNewProduct() {
    setCreateError("");
    setNewProduct({
      code: "",
      name: "",
      category: "",
      formulaKey: "rectangular-duct",
      rates: data.thicknesses.map((thickness) => ({
        thicknessId: thickness.id,
        thicknessLabel: thickness.label,
        targetGrossRate: "",
        materialMultiplier: "1",
      })),
    });
  }

  async function createProduct(event: React.FormEvent) {
    event.preventDefault();
    if (!newProduct) return;
    setCreateBusy(true);
    setCreateError("");
    try {
      await adminRequest("/api/admin/products", jsonRequest("POST", {
        code: newProduct.code,
        name: newProduct.name,
        category: newProduct.category,
        formulaKey: newProduct.formulaKey,
        rates: newProduct.rates.map((rate) => ({
          thicknessId: rate.thicknessId,
          targetGrossRate: Number(rate.targetGrossRate),
          materialMultiplier: Number(rate.materialMultiplier),
        })),
      }));
      setNewProduct(null);
      await onSaved("Новое изделие добавлено в калькулятор");
    } catch (reason) {
      setCreateError(reason instanceof Error ? reason.message : "Не удалось добавить изделие");
    } finally {
      setCreateBusy(false);
    }
  }

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
    <div className="admin-heading"><div><p className="admin-kicker">ПРАЙС</p><h1>Цены изделий</h1></div><div className="admin-heading-actions"><span>Цена указана за м² с текущим НДС и коэффициентами</span><button className="primary-button" onClick={openNewProduct}>＋ Добавить изделие</button></div></div>
    <div className="product-formula-list">
      {data.products.map((product) => {
        const formula = productFormulas[product.formulaKey];
        return <article key={product.id}><div><strong>{product.name}</strong><small>{product.code} · {product.category}</small></div><span>{formula.label}</span><code>{formula.formula}</code></article>;
      })}
    </div>
    <div className="admin-table-wrap"><table className="admin-table pricing-table"><thead><tr><th>Изделие</th><th>Диапазон</th><th>Толщина</th><th>Доля металла</th><th>Цена за м²</th></tr></thead><tbody>
      {rates.map((rate) => <tr key={rate.id}><td><strong>{rate.productName}</strong></td><td>{rate.tierKey === "default" ? "Базовая" : `${rate.minBoundary ?? 0}–${rate.maxBoundary ?? "∞"}`}</td><td>{rate.thicknessCode} мм</td><td><input type="number" step="0.01" min="0" value={rate.materialMultiplier} onChange={(event) => setRates((rows) => rows.map((item) => item.id === rate.id ? { ...item, materialMultiplier: Number(event.target.value) } : item))} /></td><td><div className="money-input"><input type="number" step="0.01" min="0" value={Number(rate.currentGrossRate.toFixed(2))} onChange={(event) => setRates((rows) => rows.map((item) => item.id === rate.id ? { ...item, currentGrossRate: Number(event.target.value) } : item))} /><span>₽</span></div></td></tr>)}
    </tbody></table></div>
    <SaveBar busy={busy} error={error} onSave={save} />
    {newProduct && <div className="modal-backdrop"><form className="admin-modal product-modal" onSubmit={createProduct}>
      <button type="button" className="modal-close" aria-label="Закрыть" onClick={() => setNewProduct(null)}>×</button>
      <h2>Новое изделие</h2>
      <p className="modal-description">Выберите существующий метод расчёта и задайте цену для каждой толщины. Изделие сразу появится в калькуляторе.</p>
      <div className="admin-form-grid">
        <label>Название<input required minLength={2} value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} /></label>
        <label>Код<input required minLength={2} pattern="[A-Za-z][A-Za-z0-9_-]*" placeholder="Например, ductExtra" value={newProduct.code} onChange={(event) => setNewProduct({ ...newProduct, code: event.target.value })} /></label>
        <label className="span-2">Категория<input required minLength={2} placeholder="Например, Фасонные изделия" value={newProduct.category} onChange={(event) => setNewProduct({ ...newProduct, category: event.target.value })} /></label>
        <label className="span-2">Метод расчёта<select value={newProduct.formulaKey} onChange={(event) => setNewProduct({ ...newProduct, formulaKey: event.target.value as ProductFormulaKey })}>{Object.values(productFormulas).map((formula) => <option value={formula.key} key={formula.key}>{formula.label}</option>)}</select></label>
        <div className="selected-formula span-2"><span>Формула площади</span><code>{productFormulas[newProduct.formulaKey].formula}</code></div>
      </div>
      <fieldset className="new-product-rates"><legend>Цены по толщине</legend>{newProduct.rates.map((rate, index) => <article key={rate.thicknessId}><strong>{rate.thicknessLabel}</strong><label>Цена за м² с НДС<input required type="number" min="0.01" step="0.01" value={rate.targetGrossRate} onChange={(event) => setNewProduct({ ...newProduct, rates: newProduct.rates.map((item, itemIndex) => itemIndex === index ? { ...item, targetGrossRate: event.target.value } : item) })} /></label><label>Доля металла<input required type="number" min="0" max="1000" step="0.01" value={rate.materialMultiplier} onChange={(event) => setNewProduct({ ...newProduct, rates: newProduct.rates.map((item, itemIndex) => itemIndex === index ? { ...item, materialMultiplier: event.target.value } : item) })} /></label></article>)}</fieldset>
      {createError && <div className="admin-alert error">{createError}</div>}
      <button className="primary-button" disabled={createBusy}>{createBusy ? "Добавляем…" : "Добавить изделие"}</button>
    </form></div>}
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
