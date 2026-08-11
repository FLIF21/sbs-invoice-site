export type InvoiceMeta = {
  invoice: string;
  date: string;
  project: string;
  request: string;
  applicant: string;
  buyer: string;
  due: string;
};

export type InvoiceRow = {
  description: string;
  qty: number;
  area: number;
  rate: number;
  total: number;
};

export type InvoiceExcelData = {
  meta: InvoiceMeta;
  rows: InvoiceRow[];
  total: number;
  vat: number;
  subtotal: number;
  taxEnabled: boolean;
  taxRate: number;
  companyName: string;
};

const templateUrl = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/invoice-template.xlsx`;
export const EXCEL_NUMBER_FORMATS = {
  text: "@",
  date: "dd.mm.yyyy",
  dateTime: "dd.mm.yyyy hh:mm",
  integer: "0",
  area: "0.###",
  money: '#,##0.00 "₽"',
} as const;

function excelCalendarDate(value: string): Date | string {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function excelLocalDateTime(value: Date): Date {
  return new Date(Date.UTC(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    value.getHours(),
    value.getMinutes(),
    value.getSeconds(),
  ));
}

export function normalizeRequestNumber(value: string): string {
  const normalized = value
    .trim()
    .replace(/^заявка(?:\s*№)?[\s.:#_–—-]*/iu, "")
    .trim();
  return normalized || "—";
}

function cloneStyle<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function buildInvoiceExcelBuffer(
  data: InvoiceExcelData,
  templateBuffer: ArrayBuffer,
  generatedAt = new Date(),
) {
  const exceljs = await import("exceljs");
  const Workbook = exceljs.Workbook ?? exceljs.default.Workbook;

  const workbook = new Workbook();
  await workbook.xlsx.load(templateBuffer as never);
  // The supplied template has no theme part. Let ExcelJS add its default theme
  // so the generated workbook never contains a dangling theme relationship.
  workbook.clearThemes();

  const sheet = workbook.worksheets[0];
  const setNumberFormat = (address: string, numberFormat: string) => {
    const cell = sheet.getCell(address);
    // ExcelJS can reuse one style object for several template cells. Clone it
    // before assigning a semantic format so a date/currency format cannot leak
    // into an unrelated neighbouring cell.
    cell.style = { ...cloneStyle(cell.style), numFmt: numberFormat };
  };
  sheet.name = "Счёт";
  sheet.views = [{ showGridLines: false }];
  sheet.pageSetup = {
    ...sheet.pageSetup,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `B3:L${33 + data.rows.length}`,
  };
  workbook.creator = data.companyName;
  workbook.modified = generatedAt;
  workbook.calcProperties.fullCalcOnLoad = true;

  sheet.eachRow({ includeEmpty: true }, row => {
    row.eachCell({ includeEmpty: true }, cell => {
      if (!cell.isMerged || cell.master.address === cell.address) cell.value = null;
    });
  });

  sheet.getCell("B3").value = "СЧЁТ";
  sheet.getCell("F3").value = "Номер счёта";
  sheet.getCell("H3").value = "Дата";
  sheet.getCell("I3").value = "№ заявки";
  sheet.getCell("J3").value = "Позиций";
  sheet.getCell("K3").value = "Итого";

  sheet.getCell("B4").value = `Счёт № ${data.meta.invoice || "—"}`;
  sheet.getCell("F4").value = data.meta.invoice || "—";
  setNumberFormat("F4", EXCEL_NUMBER_FORMATS.text);
  sheet.getCell("H4").value = excelCalendarDate(data.meta.date);
  setNumberFormat("H4", data.meta.date
    ? EXCEL_NUMBER_FORMATS.date
    : EXCEL_NUMBER_FORMATS.text);
  sheet.getCell("I4").value = normalizeRequestNumber(data.meta.request);
  setNumberFormat("I4", EXCEL_NUMBER_FORMATS.text);
  sheet.getCell("J4").value = data.rows.length;
  setNumberFormat("J4", EXCEL_NUMBER_FORMATS.integer);
  sheet.getCell("K4").value = { formula: `J${33 + data.rows.length}`, result: data.total };
  setNumberFormat("K4", EXCEL_NUMBER_FORMATS.money);

  for (const range of ["B6:C6", "D6:E6", "B7:C7", "D7:E7"]) {
    if (sheet.getCell(range.split(":")[0]).isMerged) sheet.unMergeCells(range);
  }
  sheet.mergeCells("B6:E6");
  sheet.mergeCells("B7:E7");
  sheet.getCell("B6").value = "Заявитель";
  sheet.getCell("F6").value = "Позиций";
  sheet.getCell("G6").value = "Статус";
  sheet.getCell("H6").value = "Компания";
  sheet.getCell("K6").value = "Дата формирования";

  sheet.getCell("B7").value = data.meta.applicant || "—";
  sheet.getCell("F7").value = data.rows.length;
  setNumberFormat("F7", EXCEL_NUMBER_FORMATS.integer);
  sheet.getCell("G7").value = "К оплате";
  sheet.getCell("H7").value = data.companyName;
  sheet.getCell("K7").value = excelLocalDateTime(generatedAt);
  setNumberFormat("K7", EXCEL_NUMBER_FORMATS.dateTime);

  sheet.getCell("B9").value = "Проект";
  sheet.getCell("F9").value = "Покупатель";
  sheet.getCell("K9").value = "Требуется к";
  sheet.getCell("B10").value = data.meta.project || "—";
  sheet.getCell("F10").value = data.meta.buyer || "—";
  sheet.getCell("K10").value = excelCalendarDate(data.meta.due);
  setNumberFormat("K10", data.meta.due
    ? EXCEL_NUMBER_FORMATS.date
    : EXCEL_NUMBER_FORMATS.text);

  sheet.getCell("B13").value = "СВОДКА";
  sheet.getCell("B14").value = "Общая площадь, м²";
  sheet.getCell("H14").value = "Количество позиций";
  sheet.getCell("B15").value = {
    formula: `SUM(G33:G${32 + data.rows.length})`,
    result: data.rows.reduce((sum, row) => sum + row.area, 0),
  };
  setNumberFormat("B15", EXCEL_NUMBER_FORMATS.area);
  sheet.getCell("H15").value = data.rows.length;
  setNumberFormat("H15", EXCEL_NUMBER_FORMATS.integer);

  sheet.getCell("B17").value = "ИТОГО К ОПЛАТЕ";
  sheet.getCell("B18").value = "Без НДС";
  sheet.getCell("F18").value = data.taxEnabled ? `НДС ${data.taxRate}%` : "Без НДС";
  sheet.getCell("I18").value = "К оплате";
  sheet.getCell("B19").value = data.subtotal;
  sheet.getCell("F19").value = data.vat;
  sheet.getCell("I19").value = { formula: `J${33 + data.rows.length}`, result: data.total };
  for (const address of ["B19", "F19", "I19"]) {
    setNumberFormat(address, EXCEL_NUMBER_FORMATS.money);
  }
  sheet.getCell("I19").font = { ...sheet.getCell("I19").font, bold: true };

  for (let rowNumber = 20; rowNumber <= 30; rowNumber += 1) {
    sheet.getRow(rowNumber).hidden = true;
  }

  const originalStyleRow = 33;
  const headerRow = 32;
  const totalRow = 33 + data.rows.length;
  const lastTouchedRow = Math.max(38, totalRow);

  for (let rowNumber = 32; rowNumber <= 38; rowNumber += 1) {
    for (const range of [`C${rowNumber}:E${rowNumber}`, `H${rowNumber}:I${rowNumber}`]) {
      const cell = sheet.getCell(range.split(":")[0]);
      if (cell.isMerged) sheet.unMergeCells(range);
    }
  }

  const copyRowStyle = (sourceRow: number, targetRow: number) => {
    const source = sheet.getRow(sourceRow);
    const target = sheet.getRow(targetRow);
    target.height = source.height;
    for (let column = 1; column <= 12; column += 1) {
      target.getCell(column).style = cloneStyle(source.getCell(column).style);
    }
  };

  sheet.mergeCells("C32:E32");
  sheet.mergeCells("H32:I32");
  sheet.mergeCells("J32:L32");
  sheet.getCell("B32").value = "№";
  sheet.getCell("C32").value = "Наименование";
  sheet.getCell("F32").value = "Количество";
  sheet.getCell("G32").value = "Площадь, м²";
  sheet.getCell("H32").value = "Цена за м²";
  sheet.getCell("J32").value = "Сумма";

  data.rows.forEach((item, index) => {
    const rowNumber = 33 + index;
    copyRowStyle(originalStyleRow, rowNumber);
    sheet.getRow(rowNumber).hidden = false;
    sheet.mergeCells(`C${rowNumber}:E${rowNumber}`);
    sheet.mergeCells(`H${rowNumber}:I${rowNumber}`);
    sheet.mergeCells(`J${rowNumber}:L${rowNumber}`);
    sheet.getCell(`B${rowNumber}`).value = index + 1;
    setNumberFormat(`B${rowNumber}`, EXCEL_NUMBER_FORMATS.integer);
    sheet.getCell(`C${rowNumber}`).value = item.description;
    sheet.getCell(`F${rowNumber}`).value = item.qty;
    sheet.getCell(`G${rowNumber}`).value = item.area;
    sheet.getCell(`H${rowNumber}`).value = item.rate;
    sheet.getCell(`J${rowNumber}`).value = {
      formula: `G${rowNumber}*H${rowNumber}`,
      result: item.total,
    };
    setNumberFormat(`F${rowNumber}`, EXCEL_NUMBER_FORMATS.integer);
    setNumberFormat(`G${rowNumber}`, EXCEL_NUMBER_FORMATS.area);
    setNumberFormat(`H${rowNumber}`, EXCEL_NUMBER_FORMATS.money);
    setNumberFormat(`J${rowNumber}`, EXCEL_NUMBER_FORMATS.money);
    sheet.getCell(`C${rowNumber}`).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  });

  copyRowStyle(headerRow, totalRow);
  sheet.mergeCells(`B${totalRow}:F${totalRow}`);
  sheet.mergeCells(`H${totalRow}:I${totalRow}`);
  sheet.mergeCells(`J${totalRow}:L${totalRow}`);
  sheet.getCell(`B${totalRow}`).value = "Итого";
  sheet.getCell(`G${totalRow}`).value = {
    formula: `SUM(G33:G${totalRow - 1})`,
    result: data.rows.reduce((sum, row) => sum + row.area, 0),
  };
  setNumberFormat(`G${totalRow}`, EXCEL_NUMBER_FORMATS.area);
  sheet.getCell(`H${totalRow}`).value = "К оплате";
  sheet.getCell(`J${totalRow}`).value = {
    formula: `SUM(J33:J${totalRow - 1})`,
    result: data.total,
  };
  setNumberFormat(`J${totalRow}`, EXCEL_NUMBER_FORMATS.money);

  for (let rowNumber = totalRow + 1; rowNumber <= lastTouchedRow; rowNumber += 1) {
    sheet.getRow(rowNumber).hidden = true;
  }

  return workbook.xlsx.writeBuffer();
}

async function buildInvoiceExcel(data: InvoiceExcelData) {
  const templateResponse = await fetch(templateUrl);
  if (!templateResponse.ok) throw new Error("Не удалось загрузить шаблон Excel");
  const templateBuffer = await templateResponse.arrayBuffer();
  const output = await buildInvoiceExcelBuffer(data, templateBuffer);
  const blob = new Blob([output as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Счет_СБС_${data.meta.invoice || "без_номера"}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function downloadInvoiceExcel(invoice: InvoiceDocument) {
  const clientDetails = [
    invoice.client.name,
    invoice.client.inn ? `ИНН ${invoice.client.inn}` : "",
    invoice.client.kpp ? `КПП ${invoice.client.kpp}` : "",
    invoice.client.address ?? "",
    invoice.client.phone ?? "",
    invoice.client.email ?? "",
  ].filter(Boolean).join(", ");
  await buildInvoiceExcel({
    meta: {
      invoice: invoice.number,
      date: invoice.issueDate.slice(0, 10),
      project: invoice.project ?? "",
      request: invoice.requestNumber ?? "",
      applicant: invoice.applicant ?? "",
      buyer: clientDetails,
      due: invoice.dueDate?.slice(0, 10) ?? "",
    },
    rows: invoice.items.map((item) => ({
      description: item.description,
      qty: item.quantity,
      area: item.area,
      rate: item.grossUnitPrice,
      total: item.grossTotal,
    })),
    total: invoice.total,
    vat: invoice.taxAmount,
    subtotal: invoice.subtotal,
    taxEnabled: invoice.tax.enabled,
    taxRate: invoice.tax.rate,
    companyName: invoice.company.legalName,
  });
}
import type { InvoiceDocument } from "@/lib/domain/types";
