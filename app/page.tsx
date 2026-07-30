"use client";

import { useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

type Kind = "duct" | "elbow" | "transition" | "damperRound" | "damperRect";
type Thickness = "0.5" | "0.7" | "0.9";
type NumericValue = number | "";
type Item = {
  id: number; kind: Kind; width: NumericValue; height: NumericValue; length: NumericValue;
  width2: NumericValue; height2: NumericValue; radius: NumericValue; angle: NumericValue;
  thickness: Thickness; qty: NumericValue; rail: "20/20" | "30/30";
};

const prices = {
  duct: { "0.5": 742.61, "0.7": 870.76, "0.9": 1097.69 },
  elbow: [
    { max: 1200, p: { "0.5": 1691.07, "0.7": 2058.96, "0.9": 2488.13 } },
    { max: 3200, p: { "0.5": 1616.72, "0.7": 1296.41, "0.9": 2397.79 } },
    { max: Infinity, p: { "0.5": 2112.18, "0.7": 1733.81, "0.9": 2971.82 } },
  ],
  transition: [
    { max: 1200, p: { "0.5": 2171.81, "0.7": 1965.85, "0.9": 2109.61 } },
    { max: 3200, p: { "0.5": 1770.34, "0.7": 1801.26, "0.9": 1988.32 } },
    { max: Infinity, p: { "0.5": 3116.02, "0.7": 2611.73, "0.9": 2734.72 } },
  ],
  damperRound: { "0.5": 4120, "0.7": 2450, "0.9": 4340 },
  damperRect: { "0.5": 3430, "0.7": 2600, "0.9": 2390 },
};

const labels: Record<Kind, string> = {
  duct: "Воздуховод", elbow: "Отвод", transition: "Переход",
  damperRound: "Дроссель-заслонка круглая", damperRect: "Дроссель-заслонка прямоугольная",
};
const empty = (id: number): Item => ({
  id, kind: "duct", width: 400, height: 250, length: 1500, width2: 300,
  height2: 200, radius: 100, angle: 90, thickness: "0.5", qty: 1, rail: "20/20",
});
const rub = (n: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(n);
const num = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
const publicAsset = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
const numericInput = (value: string): NumericValue => value === "" ? "" : Number(value);

function calc(item: Item) {
  const a = Number(item.width);
  const b = Number(item.height);
  const a2 = Number(item.width2);
  const b2 = Number(item.height2);
  const l = Number(item.length);
  const r = Number(item.radius);
  const angle = Number(item.angle);
  const qty = Number(item.qty);
  let unitArea = 0;
  if (item.kind === "elbow") {
    unitArea = (angle * Math.PI / 180) * (2 * (a + b)) * (a / 2 + r) / 1e6;
  } else if (item.kind === "transition") {
    const avgPerimeter = (2 * (a + b) + 2 * (a2 + b2)) / 2;
    const slant = Math.sqrt(l ** 2 + ((Math.hypot(a, b) - Math.hypot(a2, b2)) / 2) ** 2);
    unitArea = avgPerimeter * slant / 1e6;
  } else if (item.kind === "damperRound") {
    unitArea = (Math.PI * a * l + Math.PI * a ** 2 / 4) / 1e6;
  } else if (item.kind === "damperRect") {
    unitArea = (2 * (a + b) * l + a * b) / 1e6;
  } else {
    unitArea = 2 * (a + b) * l / 1e6;
  }
  const area = unitArea * qty;
  let rate = 0;
  if (item.kind === "duct") rate = prices.duct[item.thickness];
  else if (item.kind === "elbow") rate = prices.elbow.find(x => 2 * (a + b) <= x.max)!.p[item.thickness];
  else if (item.kind === "transition") {
    const perimeter = a + b + a2 + b2;
    rate = prices.transition.find(x => perimeter <= x.max)!.p[item.thickness];
  } else rate = prices[item.kind][item.thickness];
  return { area, rate, total: area * rate };
}

function description(i: Item) {
  if (i.kind === "damperRound") return `${labels[i.kind]} D${i.width} L${i.length} (оц.${i.thickness.replace(".", ",")})`;
  if (i.kind === "transition") return `Переход ${i.width}×${i.height}/${i.width2}×${i.height2} L${i.length} (оц.${i.thickness.replace(".", ",")}; ш${i.rail})`;
  if (i.kind === "elbow") return `Отвод ${i.angle}° ${i.width}×${i.height} (оц.${i.thickness.replace(".", ",")}; ш${i.rail}; R${i.radius})`;
  return `${labels[i.kind]} ${i.width}×${i.height} L${i.length} (оц.${i.thickness.replace(".", ",")}; ш${i.rail})`;
}

export default function Home() {
  const [items, setItems] = useState<Item[]>([empty(1)]);
  const [meta, setMeta] = useState({
    invoice: "448", date: new Date().toISOString().slice(0, 10), project: "",
    request: "", applicant: "", buyer: "", due: "",
  });
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => items.map(i => ({ item: i, ...calc(i) })), [items]);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const vat = total - total / 1.22;

  const updateItem = (id: number, patch: Partial<Item>) =>
    setItems(current => current.map(i => i.id === id ? { ...i, ...patch } : i));

  async function pdf() {
    setBusy(true);
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const loadFont = async (url: string) => {
        const buffer = await fetch(url).then(r => r.arrayBuffer());
        let binary = "";
        new Uint8Array(buffer).forEach(b => binary += String.fromCharCode(b));
        return btoa(binary);
      };
      doc.addFileToVFS("Arial.ttf", await loadFont(publicAsset("/arial.ttf")));
      doc.addFont("Arial.ttf", "Arial", "normal");
      doc.addFileToVFS("ArialBold.ttf", await loadFont(publicAsset("/arialbd.ttf")));
      doc.addFont("ArialBold.ttf", "Arial", "bold");
      doc.setFont("Arial", "bold"); doc.setFontSize(15);
      doc.text(`СЧЁТ № ${meta.invoice} от ${new Date(meta.date).toLocaleDateString("ru-RU")}`, 14, 18);
      doc.setFont("Arial", "normal"); doc.setFontSize(9);
      const details = [
        ["Проект", meta.project || "—"], ["№ заявки", meta.request || "—"],
        ["Заявитель", meta.applicant || "—"], ["Покупатель", meta.buyer || "—"],
        ["Требуется к", meta.due ? new Date(meta.due).toLocaleDateString("ru-RU") : "—"],
      ];
      details.forEach((x, idx) => { doc.setFont("Arial", "bold"); doc.text(`${x[0]}:`, 14, 27 + idx * 5); doc.setFont("Arial", "normal"); doc.text(x[1], 39, 27 + idx * 5); });
      autoTable(doc, {
        startY: 55,
        head: [["№", "Наименование", "Кол-во", "S, м²", "Цена за м²", "Сумма"]],
        body: rows.map((r, idx) => [String(idx + 1), description(r.item), num(Number(r.item.qty)), num(r.area), rub(r.rate), rub(r.total)]),
        styles: { font: "Arial", fontSize: 8, cellPadding: 2 },
        headStyles: { font: "Arial", fontStyle: "bold", fillColor: [35, 48, 45], textColor: 255 },
        columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 85 }, 2: { cellWidth: 16 }, 3: { cellWidth: 18 }, 4: { cellWidth: 27 }, 5: { cellWidth: 30 } },
      });
      const y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
      doc.setFont("Arial", "normal"); doc.text(`В том числе НДС 22%: ${rub(vat)}`, 196, y, { align: "right" });
      doc.setFont("Arial", "bold"); doc.setFontSize(12); doc.text(`Итого к оплате: ${rub(total)}`, 196, y + 8, { align: "right" });
      doc.setFont("Arial", "normal"); doc.setFontSize(8);
      doc.text("Счёт сформирован по расчётной модели калькулятора СБС. Цены указаны с НДС.", 14, y + 20);
      doc.save(`Счет_СБС_${meta.invoice || "без_номера"}.pdf`);
    } finally { setBusy(false); }
  }

  return (
    <main>
      <header className="topbar">
        <div><span className="mark">СБС</span><span className="brand">Счёт</span></div>
        <div className="status"><i /> Цены из калькулятора от 23.04.2026</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">КАЛЬКУЛЯТОР ВОЗДУХОВОДОВ</p>
          <h1>Счёт, который<br />считает себя сам.</h1>
          <p className="lead">Заполните реквизиты, добавьте изделия — площадь, цена и итог пересчитаются автоматически.</p>
        </div>
        <div className="total-card">
          <span>К оплате</span><strong>{rub(total)}</strong>
          <small>включая НДС 22% · {items.length} {items.length === 1 ? "позиция" : "позиций"}</small>
          <button onClick={pdf} disabled={busy}>{busy ? "Формируем…" : "Скачать PDF"} <b>↗</b></button>
        </div>
      </section>

      <section className="workspace">
        <div className="panel">
          <div className="section-title"><span>01</span><div><h2>Данные счёта</h2><p>Реквизиты появятся в PDF</p></div></div>
          <div className="form-grid">
            <label>Номер счёта<input value={meta.invoice} onChange={e => setMeta({ ...meta, invoice: e.target.value })} /></label>
            <label>Дата<input type="date" value={meta.date} onChange={e => setMeta({ ...meta, date: e.target.value })} /></label>
            <label>Проект<input placeholder="Название или шифр" value={meta.project} onChange={e => setMeta({ ...meta, project: e.target.value })} /></label>
            <label>№ заявки<input placeholder="Например, 260166" value={meta.request} onChange={e => setMeta({ ...meta, request: e.target.value })} /></label>
            <label className="wide">Покупатель<textarea placeholder="Организация, ИНН, КПП, адрес" value={meta.buyer} onChange={e => setMeta({ ...meta, buyer: e.target.value })} /></label>
            <label>Заявитель<input placeholder="ФИО" value={meta.applicant} onChange={e => setMeta({ ...meta, applicant: e.target.value })} /></label>
            <label>Требуется к<input type="date" value={meta.due} onChange={e => setMeta({ ...meta, due: e.target.value })} /></label>
          </div>
        </div>

        <div className="panel products">
          <div className="section-title"><span>02</span><div><h2>Изделия</h2><p>Расчёт повторяет формулы книги</p></div></div>
          {items.map((i, index) => {
            const c = calc(i);
            const second = i.kind === "transition";
            const elbow = i.kind === "elbow";
            return <article className="product" key={i.id}>
              <div className="product-head"><b>{String(index + 1).padStart(2, "0")}</b>
                <select value={i.kind} onChange={e => updateItem(i.id, { kind: e.target.value as Kind })}>
                  {Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button className="remove" aria-label="Удалить позицию" onClick={() => items.length > 1 && setItems(items.filter(x => x.id !== i.id))}>×</button>
              </div>
              <div className="item-grid">
                <label>{i.kind === "damperRound" ? "Диаметр, мм" : "Ширина A, мм"}<input type="number" value={i.width} onChange={e => updateItem(i.id, { width: numericInput(e.target.value) })} /></label>
                {i.kind !== "damperRound" && <label>Высота B, мм<input type="number" value={i.height} onChange={e => updateItem(i.id, { height: numericInput(e.target.value) })} /></label>}
                {second && <><label>Ширина A₂, мм<input type="number" value={i.width2} onChange={e => updateItem(i.id, { width2: numericInput(e.target.value) })} /></label><label>Высота B₂, мм<input type="number" value={i.height2} onChange={e => updateItem(i.id, { height2: numericInput(e.target.value) })} /></label></>}
                {(i.kind !== "elbow") && <label>Длина L, мм<input type="number" value={i.length} onChange={e => updateItem(i.id, { length: numericInput(e.target.value) })} /></label>}
                {elbow && <><label>Угол, °<input type="number" value={i.angle} onChange={e => updateItem(i.id, { angle: numericInput(e.target.value) })} /></label><label>Радиус R, мм<input type="number" value={i.radius} onChange={e => updateItem(i.id, { radius: numericInput(e.target.value) })} /></label></>}
                <label>Толщина<select value={i.thickness} onChange={e => updateItem(i.id, { thickness: e.target.value as Thickness })}><option value="0.5">0,5 мм</option><option value="0.7">0,7 мм</option><option value="0.9">0,9 мм</option></select></label>
                {!i.kind.includes("damper") && <label>Шинорейка<select value={i.rail} onChange={e => updateItem(i.id, { rail: e.target.value as Item["rail"] })}><option>20/20</option><option>30/30</option></select></label>}
                <label>Количество<input type="number" min="1" value={i.qty} onChange={e => updateItem(i.id, { qty: numericInput(e.target.value) })} /></label>
              </div>
              <div className="line-total"><span>{description(i)}</span><small>{num(c.area)} м² × {rub(c.rate)}</small><strong>{rub(c.total)}</strong></div>
            </article>;
          })}
          <button className="add" onClick={() => setItems([...items, empty(Math.max(...items.map(i => i.id)) + 1)])}>＋ Добавить изделие</button>
        </div>

        <aside className="summary">
          <p>Сводка</p>
          <div><span>Позиций</span><b>{items.length}</b></div>
          <div><span>Общая площадь</span><b>{num(rows.reduce((s, r) => s + r.area, 0))} м²</b></div>
          <div><span>Без НДС</span><b>{rub(total / 1.22)}</b></div>
          <div><span>НДС 22%</span><b>{rub(vat)}</b></div>
          <div className="grand"><span>Итого</span><b>{rub(total)}</b></div>
          <button onClick={pdf} disabled={busy}>Скачать счёт в PDF</button>
          <small>Расчёт выполняется в браузере. Данные никуда не отправляются.</small>
        </aside>
      </section>
      <footer>производство воздуховодов <span>ООО &quot;ФЮСИС-В&quot;</span></footer>
    </main>
  );
}
