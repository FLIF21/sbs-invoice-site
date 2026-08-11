import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { beforeAll, describe, expect, it } from "vitest";
import type { InvoiceDocument } from "@/lib/domain/types";
import { buildInvoicePdf, type InvoicePdfAssets } from "./pdf-export";

const projectRoot = process.cwd();
const temporaryDirectory = path.join(projectRoot, "tmp", "pdfs");
const outputDirectory = path.join(projectRoot, "output", "pdf");
const counts = [1, 20, 50] as const;

function invoiceFixture(itemCount: number): InvoiceDocument {
  const items = Array.from({ length: itemCount }, (_, index) => ({
    productId: `product-${index + 1}`,
    productCode: "duct",
    productName: "Воздуховод",
    description: `Позиция ${index + 1}: Воздуховод прямоугольный усиленный 400×250 L1500 (оц.0,5; ш20/20)`,
    dimensions: { width: 400, height: 250, length: 1500, rail: "20/20" },
    thicknessCode: "0.5",
    quantity: 1,
    area: 1.95,
    netUnitPrice: 608.696,
    grossUnitPrice: 742.609,
    netTotal: 1186.96,
    grossTotal: 1448.09,
    pricingSnapshot: {},
  }));
  return {
    id: `invoice-${itemCount}`,
    number: `2026-${String(itemCount).padStart(4, "0")}`,
    status: "ISSUED",
    issueDate: "2026-08-11T12:00:00.000Z",
    dueDate: "2026-08-27T12:00:00.000Z",
    project: "Проект вентиляции производственного комплекса с длинным наименованием",
    requestNumber: "789678687",
    applicant: "Павел Иванович Петров",
    notes: null,
    subtotal: 1186.96 * itemCount,
    taxAmount: 261.13 * itemCount,
    total: 1448.09 * itemCount,
    tax: { enabled: true, rate: 22 },
    company: {
      name: "СБС",
      legalName: "Общество с ограниченной ответственностью «Поставщик вентиляционных систем»",
      inn: "7700000000",
      kpp: "770001001",
      ogrn: "1000000000000",
      bankName: "Акционерное общество «Расчётный промышленный банк»",
      bik: "044525000",
      checking: "40702810000000000000",
      correspondent: "30101810000000000000",
      address: "Российская Федерация, 109000, город Москва, улица Производственная, дом 1, строение 2, помещение 345",
      phone: "+7 495 000-00-00",
      email: "billing@example.test",
      website: "https://example.test",
    },
    client: {
      name: "Общество с ограниченной ответственностью «Очень длинное наименование покупателя для проверки корректного переноса текста в документе»",
      inn: "7800000000",
      kpp: "780001001",
      address: "Российская Федерация, 190000, город Санкт-Петербург, муниципальный округ Адмиралтейский, набережная Длинного Названия, дом 123, корпус 45, офис 6789",
      phone: "+7 812 000-00-00",
      email: "accounts-payable@example.test",
    },
    items,
  };
}

type GeneratedPdf = {
  bytes: Uint8Array;
  pageTexts: string[];
  pageSizes: Array<{ width: number; height: number }>;
};

async function extractPdf(bytes: Uint8Array): Promise<Omit<GeneratedPdf, "bytes">> {
  const loadingTask = getDocument({ data: bytes, disableFontFace: true, isEvalSupported: false, useWorkerFetch: false });
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];
  const pageSizes: Array<{ width: number; height: number }> = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim());
    pageSizes.push({ width: viewport.width, height: viewport.height });
  }
  await pdf.destroy();
  return { pageTexts, pageSizes };
}

describe("PDF-счёт", () => {
  const generated = new Map<number, GeneratedPdf>();
  let assets: InvoicePdfAssets;

  beforeAll(async () => {
    const [regular, bold] = await Promise.all([
      readFile(path.join(projectRoot, "public", "arial.ttf")),
      readFile(path.join(projectRoot, "public", "arialbd.ttf")),
    ]);
    assets = { fontRegularBase64: regular.toString("base64"), fontBoldBase64: bold.toString("base64") };
    await Promise.all([mkdir(temporaryDirectory, { recursive: true }), mkdir(outputDirectory, { recursive: true })]);

    for (const count of counts) {
      const bytes = new Uint8Array(buildInvoicePdf(invoiceFixture(count), assets).output("arraybuffer"));
      const filePath = count === 50
        ? path.join(outputDirectory, "sbs-invoice-a4-50-items.pdf")
        : path.join(temporaryDirectory, `sbs-invoice-a4-${count}-items.pdf`);
      await writeFile(filePath, bytes);
      generated.set(count, { bytes, ...(await extractPdf(bytes)) });
    }
  }, 30_000);

  it("не создаёт неполный платёжный документ", () => {
    const invoice = invoiceFixture(1);
    invoice.company.bik = null;
    expect(() => buildInvoicePdf(invoice, assets)).toThrow(/В настройках компании заполните: БИК/);
  });

  it("извлекает из PDF обязательные данные покупателя и поставщика", () => {
    const text = generated.get(1)!.pageTexts.join(" ");
    for (const expected of [
      "СЧЁТ № 2026-0001", "11.08.2026", "Проект вентиляции", "789678687", "Павел Иванович Петров",
      "Очень длинное наименование покупателя", "ИНН 7800000000", "КПП 780001001", "муниципальный округ Адмиралтейский",
      "+7 812 000-00-00", "accounts-payable@example.test", "27.08.2026", "Площадь, м²", "Цена за м²",
      "Сумма без НДС", "НДС 22%", "Итого к оплате", "ПЛАТЁЖНЫЕ РЕКВИЗИТЫ ПОСТАВЩИКА",
      "Поставщик вентиляционных систем", "7700000000", "770001001", "Расчётный промышленный банк",
      "044525000", "40702810000000000000", "30101810000000000000", "billing@example.test", "https://example.test",
    ]) expect(text).toContain(expected);
  });

  it.each(counts)("формирует A4 для %s позиций, повторяет заголовок таблицы и не теряет строки", (count) => {
    const pdf = generated.get(count)!;
    expect(pdf.pageSizes.every(({ width, height }) => Math.abs(width - 595.28) < 0.2 && Math.abs(height - 841.89) < 0.2)).toBe(true);
    const pagesWithItems = pdf.pageTexts.filter((text) => /Позиция \d+:/.test(text));
    expect(pagesWithItems.length).toBeGreaterThan(0);
    expect(pagesWithItems.every((text) => text.includes("Наименование") && text.includes("Площадь, м²"))).toBe(true);
    const allText = pdf.pageTexts.join(" ");
    expect(allText).toContain(`Позиция ${count}:`);
    expect(allText).toContain(`страница ${pdf.pageTexts.length} из ${pdf.pageTexts.length}`);
  });

  it("переносит таблицу на следующие страницы при 50 позициях", () => {
    expect(generated.get(50)!.pageTexts.length).toBeGreaterThanOrEqual(3);
  });
});
