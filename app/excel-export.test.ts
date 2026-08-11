import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  buildInvoiceExcelBuffer,
  EXCEL_NUMBER_FORMATS,
  type InvoiceExcelData,
} from "./excel-export";

const outputDirectory = path.join(
  process.cwd(),
  "outputs",
  "excel-format-fix-20260811",
);
const outputPath = path.join(outputDirectory, "sbs-invoice-format-test.xlsx");
const generatedAt = new Date(2026, 7, 11, 14, 35, 0);

const fixture: InvoiceExcelData = {
  meta: {
    invoice: "000001",
    date: "2026-08-11",
    project: "Тестовый проект",
    request: "ЗАЯВКА-0007",
    applicant: "Иван Петров",
    buyer: "ООО «Тест», ИНН 7700000000",
    due: "2026-08-20",
  },
  rows: [
    {
      description: "Воздуховод 400×250 L1500 (оц.0,5; ш20/20)",
      qty: 1,
      area: 1.95,
      rate: 742.6102564102564,
      total: 1448.09,
    },
  ],
  subtotal: 1186.96,
  vat: 261.13,
  total: 1448.09,
  taxEnabled: true,
  taxRate: 22,
  companyName: "ООО «ФЮСИС-В»",
};

async function generateWorkbook() {
  const template = await readFile(
    path.join(process.cwd(), "public", "invoice-template.xlsx"),
  );
  const templateBuffer = template.buffer.slice(
    template.byteOffset,
    template.byteOffset + template.byteLength,
  ) as ArrayBuffer;
  const output = await buildInvoiceExcelBuffer(fixture, templateBuffer, generatedAt);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, Buffer.from(output));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(output);
  return workbook;
}

function expectFormula(
  cell: ExcelJS.Cell,
  formula: string,
  result: number,
) {
  expect(cell.value).toMatchObject({ formula, result });
}

describe("генерация Excel-счёта", () => {
  it("сохраняет семантические типы и форматы ячеек", async () => {
    const workbook = await generateWorkbook();
    const sheet = workbook.getWorksheet("Счёт");
    expect(sheet).toBeDefined();
    if (!sheet) throw new Error("Лист «Счёт» не найден");

    expect(sheet.getCell("F4").value).toBe("000001");
    expect(sheet.getCell("F4").numFmt).toBe(EXCEL_NUMBER_FORMATS.text);
    expect(sheet.getCell("H4").value).toBeInstanceOf(Date);
    expect((sheet.getCell("H4").value as Date).toISOString()).toBe(
      "2026-08-11T00:00:00.000Z",
    );
    expect(sheet.getCell("H4").numFmt).toBe(EXCEL_NUMBER_FORMATS.date);
    expect(sheet.getCell("I4").value).toBe("0007");
    expect(sheet.getCell("I4").numFmt).toBe(EXCEL_NUMBER_FORMATS.text);
    expect(sheet.getCell("B6").value).toBe("Заявитель");
    expect(sheet.getCell("B7").value).toBe("Иван Петров");
    expect(sheet.getCell("B6").master.address).toBe("B6");
    expect(sheet.getCell("E6").master.address).toBe("B6");
    expect(sheet.getCell("B7").master.address).toBe("B7");
    expect(sheet.getCell("E7").master.address).toBe("B7");

    const requestNumberCells: string[] = [];
    sheet.eachRow({ includeEmpty: false }, row => {
      row.eachCell({ includeEmpty: false }, cell => {
        if (cell.master.address === cell.address && cell.value === "0007") {
          requestNumberCells.push(cell.address);
        }
      });
    });
    expect(requestNumberCells).toEqual(["I4"]);

    for (const address of ["J4", "F7", "H15", "B33", "F33"]) {
      const cell = sheet.getCell(address);
      expect(typeof cell.value, address).toBe("number");
      expect(cell.value, address).toBe(1);
      expect(cell.numFmt, address).toBe(EXCEL_NUMBER_FORMATS.integer);
      expect(cell.value, address).not.toBeInstanceOf(Date);
      expect(cell.numFmt, address).not.toContain("₽");
    }

    for (const address of ["B15", "G33", "G34"]) {
      const cell = sheet.getCell(address);
      expect(cell.numFmt, address).toBe(EXCEL_NUMBER_FORMATS.area);
      expect(cell.numFmt, address).not.toContain("₽");
    }
    expect(sheet.getCell("G33").value).toBe(1.95);

    for (const address of ["K4", "B19", "F19", "I19", "H33", "J33", "J34"]) {
      const cell = sheet.getCell(address);
      expect(cell.numFmt, address).toBe(EXCEL_NUMBER_FORMATS.money);
      expect(cell.numFmt, address).toContain("₽");
      expect(cell.value, address).not.toBeInstanceOf(Date);
    }

    expect(sheet.getCell("K7").value).toBeInstanceOf(Date);
    expect((sheet.getCell("K7").value as Date).toISOString()).toBe(
      "2026-08-11T14:35:00.000Z",
    );
    expect(sheet.getCell("K7").numFmt).toBe(EXCEL_NUMBER_FORMATS.dateTime);
    expect(sheet.getCell("K10").value).toBeInstanceOf(Date);
    expect((sheet.getCell("K10").value as Date).toISOString()).toBe(
      "2026-08-20T00:00:00.000Z",
    );
    expect(sheet.getCell("K10").numFmt).toBe(EXCEL_NUMBER_FORMATS.date);
  });

  it("сохраняет формулы строк и итогов без ошибок Excel", async () => {
    const workbook = await generateWorkbook();
    const sheet = workbook.getWorksheet("Счёт");
    if (!sheet) throw new Error("Лист «Счёт» не найден");

    expectFormula(sheet.getCell("J33"), "G33*H33", 1448.09);
    expectFormula(sheet.getCell("G34"), "SUM(G33:G33)", 1.95);
    expectFormula(sheet.getCell("J34"), "SUM(J33:J33)", 1448.09);
    expectFormula(sheet.getCell("B15"), "SUM(G33:G33)", 1.95);
    expectFormula(sheet.getCell("I19"), "J34", 1448.09);
    expectFormula(sheet.getCell("K4"), "J34", 1448.09);

    const excelErrors = ["#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#N/A"];
    sheet.eachRow({ includeEmpty: false }, row => {
      row.eachCell({ includeEmpty: false }, cell => {
        const serialized = JSON.stringify(cell.value);
        for (const error of excelErrors) {
          expect(serialized, `${cell.address}: ${error}`).not.toContain(error);
        }
      });
    });
  });
});
