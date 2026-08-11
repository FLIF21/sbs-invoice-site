"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { assertCompanyPaymentDetails } from "../domain/company";
import type { CompanySnapshot, InvoiceDocument } from "../domain/types";

export type InvoicePdfAssets = {
  fontRegularBase64: string;
  fontBoldBase64: string;
  logoDataUrl?: string | null;
};

const PAGE = { left: 14, right: 196, bottom: 281 };
const CONTENT_WIDTH = PAGE.right - PAGE.left;
const rub = (value: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(value);
const num = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat("ru-RU").format(new Date(value));

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

async function fetchBase64(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Не удалось загрузить шрифт PDF");
  return bytesToBase64(new Uint8Array(await response.arrayBuffer()));
}

async function fetchLogoDataUrl(url?: string | null) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const mime = response.headers.get("content-type") ?? "image/png";
    return `data:${mime};base64,${bytesToBase64(new Uint8Array(await response.arrayBuffer()))}`;
  } catch {
    return null;
  }
}

function addCompanyLogo(doc: jsPDF, logoDataUrl?: string | null) {
  if (!logoDataUrl) return;
  const format = logoDataUrl.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
  doc.addImage(logoDataUrl, format, 166, 9, 30, 14, undefined, "FAST");
}

function ensureSpace(doc: jsPDF, y: number, requiredHeight: number) {
  if (y + requiredHeight <= PAGE.bottom) return y;
  doc.addPage("a4", "portrait");
  return 18;
}

function drawInvoiceFields(doc: jsPDF, invoice: InvoiceDocument, startY: number) {
  const taxId = [invoice.client.inn ? `ИНН ${invoice.client.inn}` : "", invoice.client.kpp ? `КПП ${invoice.client.kpp}` : ""]
    .filter(Boolean).join(" / ") || "—";
  const contacts = [invoice.client.phone ? `тел. ${invoice.client.phone}` : "", invoice.client.email ?? ""]
    .filter(Boolean).join(" / ");
  const rows = [
    ["Проект", invoice.project || "—"],
    ["№ заявки", invoice.requestNumber || "—"],
    ["Заявитель", invoice.applicant || "—"],
    ["Покупатель", invoice.client.name],
    ["ИНН / КПП", taxId],
    ["Адрес", invoice.client.address || "—"],
    ...(contacts ? [["Телефон / email", contacts]] : []),
    ["Требуется к", invoice.dueDate ? date(invoice.dueDate) : "—"],
  ];

  let y = startY;
  doc.setFontSize(8.5);
  for (const [label, value] of rows) {
    const lines = doc.splitTextToSize(value, 145) as string[];
    doc.setFont("Arial", "bold");
    doc.setTextColor(73, 87, 82);
    doc.text(`${label}:`, PAGE.left, y);
    doc.setFont("Arial", "normal");
    doc.setTextColor(20, 29, 26);
    doc.text(lines, 48, y);
    y += Math.max(4.8, lines.length * 4.1 + 0.8);
  }
  return y;
}

function drawTotals(doc: jsPDF, invoice: InvoiceDocument, requestedY: number) {
  const y = ensureSpace(doc, requestedY, 31);
  doc.setDrawColor(35, 48, 45);
  doc.setFillColor(244, 247, 245);
  doc.roundedRect(112, y, 84, 28, 1, 1, "FD");
  doc.setFontSize(8.5);
  doc.setTextColor(67, 79, 75);
  doc.setFont("Arial", "normal");
  doc.text("Сумма без НДС", 116, y + 6);
  doc.text(rub(invoice.subtotal), 192, y + 6, { align: "right" });
  doc.text(invoice.tax.enabled ? `НДС ${num(invoice.tax.rate)}%` : "НДС не облагается", 116, y + 12);
  doc.text(invoice.tax.enabled ? rub(invoice.taxAmount) : rub(0), 192, y + 12, { align: "right" });
  doc.setDrawColor(195, 204, 200);
  doc.line(116, y + 16, 192, y + 16);
  doc.setFont("Arial", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(20, 29, 26);
  doc.text("Итого к оплате", 116, y + 23);
  doc.text(rub(invoice.total), 192, y + 23, { align: "right" });
  return y + 36;
}

function supplierRows(company: CompanySnapshot) {
  return [
    ["Юридическое наименование", company.legalName],
    ["ИНН / КПП", `${company.inn} / ${company.kpp}`],
    ...(company.ogrn ? [["ОГРН", company.ogrn]] : []),
    ["Адрес", company.address!],
    ["Банк", company.bankName!],
    ["БИК", company.bik!],
    ["Расчётный счёт", company.checking!],
    ["Корреспондентский счёт", company.correspondent!],
    ...((company.phone || company.email) ? [["Телефон / email", [company.phone, company.email].filter(Boolean).join(" / ")]] : []),
    ...(company.website ? [["Сайт", company.website]] : []),
  ];
}

function drawSupplierDetails(doc: jsPDF, company: CompanySnapshot, requestedY: number) {
  const rows = supplierRows(company).map(([label, value]) => ({
    label,
    lines: doc.splitTextToSize(value, 132) as string[],
  }));
  const height = 11 + rows.reduce((sum, row) => sum + Math.max(6, row.lines.length * 4 + 2), 0);
  const y = ensureSpace(doc, requestedY, height);

  doc.setFillColor(35, 48, 45);
  doc.roundedRect(PAGE.left, y, CONTENT_WIDTH, 9, 1, 1, "F");
  doc.setFont("Arial", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("ПЛАТЁЖНЫЕ РЕКВИЗИТЫ ПОСТАВЩИКА", PAGE.left + 4, y + 6);

  let rowY = y + 12;
  doc.setFontSize(8);
  rows.forEach((row, index) => {
    const rowHeight = Math.max(6, row.lines.length * 4 + 2);
    doc.setFont("Arial", "bold");
    doc.setTextColor(73, 87, 82);
    doc.text(row.label, PAGE.left + 3, rowY + 3.8);
    doc.setFont("Arial", "normal");
    doc.setTextColor(20, 29, 26);
    doc.text(row.lines, PAGE.left + 47, rowY + 3.8);
    if (index < rows.length - 1) {
      doc.setDrawColor(220, 226, 223);
      doc.line(PAGE.left + 3, rowY + rowHeight, PAGE.right - 3, rowY + rowHeight);
    }
    rowY += rowHeight;
  });
  doc.setDrawColor(175, 186, 181);
  doc.roundedRect(PAGE.left, y, CONTENT_WIDTH, rowY - y + 1, 1, 1, "S");
}

function addPageFooters(doc: jsPDF, invoiceNumber: string) {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(216, 223, 220);
    doc.line(PAGE.left, 287, PAGE.right, 287);
    doc.setFont("Arial", "normal");
    doc.setFontSize(7);
    doc.setTextColor(105, 116, 112);
    doc.text(`Счёт № ${invoiceNumber} - страница ${page} из ${pageCount}`, PAGE.right, 291.5, { align: "right" });
  }
}

export function buildInvoicePdf(invoice: InvoiceDocument, assets: InvoicePdfAssets) {
  assertCompanyPaymentDetails(invoice.company);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  doc.addFileToVFS("Arial.ttf", assets.fontRegularBase64);
  doc.addFont("Arial.ttf", "Arial", "normal");
  doc.addFileToVFS("ArialBold.ttf", assets.fontBoldBase64);
  doc.addFont("ArialBold.ttf", "Arial", "bold");
  doc.setProperties({ title: `Счёт № ${invoice.number}`, subject: "Счёт на оплату", author: invoice.company.legalName });
  addCompanyLogo(doc, assets.logoDataUrl);

  doc.setFont("Arial", "bold");
  doc.setFontSize(15);
  doc.setTextColor(20, 29, 26);
  doc.text(`СЧЁТ № ${invoice.number}`, PAGE.left, 17);
  doc.setFont("Arial", "normal");
  doc.setFontSize(9);
  doc.text(`от ${date(invoice.issueDate)}`, PAGE.left, 23);
  if (!assets.logoDataUrl) {
    doc.setFont("Arial", "bold");
    doc.setFontSize(9);
    doc.text(invoice.company.name, PAGE.right, 21, { align: "right", maxWidth: 70 });
  }
  doc.setDrawColor(35, 48, 45);
  doc.setLineWidth(0.5);
  doc.line(PAGE.left, 27, PAGE.right, 27);

  const fieldsEndY = drawInvoiceFields(doc, invoice, 34);
  autoTable(doc, {
    startY: fieldsEndY + 3,
    head: [["№", "Наименование", "Кол-во", "Площадь, м²", "Цена за м²", "Сумма"]],
    body: invoice.items.map((item, index) => [
      String(index + 1), item.description, num(item.quantity), num(item.area), rub(item.grossUnitPrice), rub(item.grossTotal),
    ]),
    showHead: "everyPage",
    rowPageBreak: "avoid",
    margin: { top: 16, right: PAGE.left, bottom: 18, left: PAGE.left },
    styles: { font: "Arial", fontSize: 7.7, cellPadding: 2, overflow: "linebreak", valign: "middle", textColor: [20, 29, 26], lineColor: [218, 224, 221], lineWidth: 0.15 },
    headStyles: { font: "Arial", fontStyle: "bold", fillColor: [35, 48, 45], textColor: 255, minCellHeight: 8 },
    alternateRowStyles: { fillColor: [247, 249, 248] },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 72 },
      2: { cellWidth: 17, halign: "right" },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 29, halign: "right" },
      5: { cellWidth: 36, halign: "right" },
    },
  });

  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const supplierY = drawTotals(doc, invoice, finalY + 7);
  drawSupplierDetails(doc, invoice.company, supplierY);
  addPageFooters(doc, invoice.number);
  return doc;
}

export async function downloadInvoicePdf(invoice: InvoiceDocument) {
  const [fontRegularBase64, fontBoldBase64, logoDataUrl] = await Promise.all([
    fetchBase64("/arial.ttf"),
    fetchBase64("/arialbd.ttf"),
    fetchLogoDataUrl(invoice.company.logoUrl),
  ]);
  const doc = buildInvoicePdf(invoice, { fontRegularBase64, fontBoldBase64, logoDataUrl });
  doc.save(`Счет_СБС_${invoice.number}.pdf`);
}
