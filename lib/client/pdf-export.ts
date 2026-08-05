"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { InvoiceDocument } from "@/lib/domain/types";

const rub = (value: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(value);
const num = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value);

async function fontBase64(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Не удалось загрузить шрифт PDF");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

async function addCompanyLogo(doc: jsPDF, logoUrl?: string | null) {
  if (!logoUrl) return;
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return;
    const mime = response.headers.get("content-type") ?? "image/png";
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    const dataUrl = `data:${mime};base64,${btoa(binary)}`;
    doc.addImage(dataUrl, mime.includes("jpeg") ? "JPEG" : "PNG", 166, 10, 30, 14, undefined, "FAST");
  } catch {
    // Логотип не должен блокировать формирование счёта.
  }
}

export async function downloadInvoicePdf(invoice: InvoiceDocument) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.addFileToVFS("Arial.ttf", await fontBase64("/arial.ttf"));
  doc.addFont("Arial.ttf", "Arial", "normal");
  doc.addFileToVFS("ArialBold.ttf", await fontBase64("/arialbd.ttf"));
  doc.addFont("ArialBold.ttf", "Arial", "bold");
  await addCompanyLogo(doc, invoice.company.logoUrl);

  doc.setFont("Arial", "bold");
  doc.setFontSize(15);
  doc.text(`СЧЁТ № ${invoice.number} от ${new Date(invoice.issueDate).toLocaleDateString("ru-RU")}`, 14, 18);
  doc.setFontSize(8);
  doc.text(invoice.company.legalName, 196, 29, { align: "right" });

  const buyer = [invoice.client.name, invoice.client.inn ? `ИНН ${invoice.client.inn}` : "", invoice.client.kpp ? `КПП ${invoice.client.kpp}` : ""]
    .filter(Boolean).join(", ");
  const details = [
    ["Проект", invoice.project || "—"],
    ["№ заявки", invoice.requestNumber || "—"],
    ["Заявитель", invoice.applicant || "—"],
    ["Покупатель", buyer],
    ["Требуется к", invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("ru-RU") : "—"],
  ];
  details.forEach(([label, value], index) => {
    doc.setFont("Arial", "bold");
    doc.text(`${label}:`, 14, 30 + index * 5);
    doc.setFont("Arial", "normal");
    doc.text(value, 39, 30 + index * 5, { maxWidth: 155 });
  });

  autoTable(doc, {
    startY: 58,
    head: [["№", "Наименование", "Кол-во", "S, м²", "Цена за м²", "Сумма"]],
    body: invoice.items.map((item, index) => [
      String(index + 1), item.description, num(item.quantity), num(item.area), rub(item.grossUnitPrice), rub(item.grossTotal),
    ]),
    styles: { font: "Arial", fontSize: 8, cellPadding: 2 },
    headStyles: { font: "Arial", fontStyle: "bold", fillColor: [35, 48, 45], textColor: 255 },
    columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 85 }, 2: { cellWidth: 16 }, 3: { cellWidth: 18 }, 4: { cellWidth: 27 }, 5: { cellWidth: 30 } },
  });
  const y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont("Arial", "normal");
  doc.text(invoice.tax.enabled ? `В том числе НДС ${invoice.tax.rate}%: ${rub(invoice.taxAmount)}` : "Без НДС", 196, y, { align: "right" });
  doc.setFont("Arial", "bold");
  doc.setFontSize(12);
  doc.text(`Итого к оплате: ${rub(invoice.total)}`, 196, y + 8, { align: "right" });
  doc.setFont("Arial", "normal");
  doc.setFontSize(8);
  let detailsY = y + 20;
  if (detailsY > 255) { doc.addPage(); detailsY = 20; }
  const companyDetails = [
    invoice.company.legalName,
    [invoice.company.inn ? `ИНН ${invoice.company.inn}` : "", invoice.company.kpp ? `КПП ${invoice.company.kpp}` : "", invoice.company.ogrn ? `ОГРН ${invoice.company.ogrn}` : ""].filter(Boolean).join(" · "),
    invoice.company.address ?? "",
    [invoice.company.bankName ?? "", invoice.company.bik ? `БИК ${invoice.company.bik}` : ""].filter(Boolean).join(" · "),
    [invoice.company.checking ? `р/с ${invoice.company.checking}` : "", invoice.company.correspondent ? `к/с ${invoice.company.correspondent}` : ""].filter(Boolean).join(" · "),
    [invoice.company.phone ?? "", invoice.company.email ?? "", invoice.company.website ?? ""].filter(Boolean).join(" · "),
  ].filter(Boolean);
  doc.setFont("Arial", "bold");
  doc.text("Реквизиты поставщика", 14, detailsY);
  doc.setFont("Arial", "normal");
  companyDetails.forEach((line, index) => doc.text(line, 14, detailsY + 5 + index * 4, { maxWidth: 182 }));
  doc.save(`Счет_СБС_${invoice.number}.pdf`);
}
