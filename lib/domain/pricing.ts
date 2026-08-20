import type {
  CalculatedLine,
  CalculatedQuote,
  ProductDimensions,
  PublicCatalog,
  QuoteItemInput,
} from "./types";
import { grossMoney, roundArea, roundMoney, roundRate, sumMoney } from "./rounding";
import { MIN_RECTANGULAR_WIDTH_MM } from "../validation/numeric-input";

export class QuoteInputError extends Error {}

function positive(value: number | undefined, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Поле «${field}» должно быть больше нуля`);
  }
  return value;
}

function positiveInteger(value: number | undefined, field: string) {
  const parsed = positive(value, field);
  if (!Number.isInteger(parsed)) throw new Error(`Поле «${field}» должно быть целым числом не меньше 1`);
  return parsed;
}

function rectangularWidth(value: number | undefined, field: string) {
  const parsed = positive(value, field);
  if (parsed < MIN_RECTANGULAR_WIDTH_MM) {
    throw new QuoteInputError(`Поле «${field}» должно быть не меньше ${MIN_RECTANGULAR_WIDTH_MM} мм`);
  }
  return parsed;
}

export function calculateArea(method: string, dimensions: ProductDimensions, quantity: number) {
  const qty = positiveInteger(quantity, "Количество");
  const width = dimensions.width;
  const height = dimensions.height;
  const length = dimensions.length;
  let unitArea: number;

  switch (method) {
    case "RECTANGULAR_DUCT": {
      const a = rectangularWidth(width, "Ширина A");
      const b = rectangularWidth(height, "Ширина B");
      const l = positive(length ?? 1500, "Длина L");
      unitArea = 2 * (a + b) * l / 1_000_000;
      break;
    }
    case "RECTANGULAR_ELBOW": {
      const a = rectangularWidth(width, "Ширина A");
      const b = rectangularWidth(height, "Ширина B");
      const radius = positive(dimensions.radius, "Радиус");
      const angle = positive(dimensions.angle, "Угол");
      unitArea = (angle * Math.PI / 180) * (2 * (a + b)) * (a / 2 + radius) / 1_000_000;
      break;
    }
    case "RECTANGULAR_TRANSITION": {
      const a = rectangularWidth(width, "Ширина A");
      const b = rectangularWidth(height, "Ширина B");
      const l = positive(length, "Длина");
      const diameter = dimensions.diameter;
      const secondPerimeter = diameter
        ? Math.PI * positive(diameter, "Диаметр D")
        : 2 * (rectangularWidth(dimensions.width2, "Ширина A₂") + rectangularWidth(dimensions.height2, "Ширина B₂"));
      const secondCalculationSize = diameter
        ? Math.PI * diameter / (2 * Math.SQRT2)
        : Math.hypot(rectangularWidth(dimensions.width2, "Ширина A₂"), rectangularWidth(dimensions.height2, "Ширина B₂"));
      const averagePerimeter = (2 * (a + b) + secondPerimeter) / 2;
      const slant = Math.sqrt(l ** 2 + ((Math.hypot(a, b) - secondCalculationSize) / 2) ** 2);
      unitArea = averagePerimeter * slant / 1_000_000;
      break;
    }
    case "ROUND_DAMPER": {
      const diameter = positive(width, "Диаметр");
      const l = positive(length, "Длина");
      unitArea = (Math.PI * diameter * l + Math.PI * diameter ** 2 / 4) / 1_000_000;
      break;
    }
    case "RECTANGULAR_DAMPER": {
      const a = rectangularWidth(width, "Ширина A");
      const b = rectangularWidth(height, "Ширина B");
      const l = positive(length, "Длина");
      unitArea = (2 * (a + b) * l + a * b) / 1_000_000;
      break;
    }
    case "CUSTOM_AREA":
      unitArea = positive(dimensions.area, "Площадь");
      break;
    default: {
      const a = rectangularWidth(width, "Ширина A");
      const b = rectangularWidth(height, "Ширина B");
      const l = positive(length, "Длина");
      unitArea = 2 * (a + b) * l / 1_000_000;
    }
  }

  return roundArea(unitArea * qty);
}

function boundaryFor(method: string, dimensions: ProductDimensions) {
  if (method === "RECTANGULAR_ELBOW") {
    return 2 * (positive(dimensions.width, "Ширина") + positive(dimensions.height, "Высота"));
  }
  if (method === "RECTANGULAR_TRANSITION") {
    if (dimensions.diameter) {
      return positive(dimensions.width, "Ширина A") + positive(dimensions.height, "Ширина B")
        + Math.PI * positive(dimensions.diameter, "Диаметр D") / 2;
    }
    return positive(dimensions.width, "Ширина A") + positive(dimensions.height, "Ширина B")
      + positive(dimensions.width2, "Ширина A₂") + positive(dimensions.height2, "Ширина B₂");
  }
  return 0;
}

function description(name: string, method: string, dimensions: ProductDimensions, thickness: string) {
  const rail = dimensions.rail ? `; ш${dimensions.rail}` : "";
  const metal = `оц.${thickness.replace(".", ",")}`;
  if (method === "ROUND_DAMPER") return `${name} D${dimensions.width} L${dimensions.length} (${metal})`;
  if (method === "RECTANGULAR_TRANSITION") {
    if (dimensions.diameter) return `${name} ${dimensions.width}×${dimensions.height}/D${dimensions.diameter} L${dimensions.length} (${metal}${rail})`;
    return `${name} ${dimensions.width}×${dimensions.height}/${dimensions.width2}×${dimensions.height2} L${dimensions.length} (${metal}${rail})`;
  }
  if (method === "RECTANGULAR_ELBOW") {
    return `${name} ${dimensions.angle}° ${dimensions.width}×${dimensions.height} (${metal}${rail}; R${dimensions.radius})`;
  }
  if (method === "CUSTOM_AREA") return `${name} (${metal})`;
  return `${name} ${dimensions.width}×${dimensions.height} L${dimensions.length} (${metal}${rail})`;
}

export function calculateQuote(items: QuoteItemInput[], catalog: PublicCatalog): CalculatedQuote {
  const coefficient = catalog.coefficients
    .filter((item) => item.enabled)
    .reduce((value, item) => value * item.value, 1);
  const taxMultiplier = catalog.tax.enabled ? 1 + catalog.tax.rate / 100 : 1;

  const lines: CalculatedLine[] = items.map((item) => {
    const product = catalog.products.find((candidate) => candidate.code === item.productCode && candidate.rates.length > 0);
    const thickness = catalog.thicknesses.find((candidate) => candidate.code === item.thicknessCode);
    if (!product || !thickness) throw new Error("Изделие или толщина больше недоступны");

    const boundary = boundaryFor(product.calculationMethod, item.dimensions);
    const candidates = product.rates
      .filter((rate) => rate.thicknessCode === item.thicknessCode)
      .sort((a, b) => (a.maxBoundary ?? Number.POSITIVE_INFINITY) - (b.maxBoundary ?? Number.POSITIVE_INFINITY));
    const rate = candidates.find((candidate) =>
      (candidate.minBoundary === null || boundary > candidate.minBoundary)
      && (candidate.maxBoundary === null || boundary <= candidate.maxBoundary));
    if (!rate) throw new Error(`Для изделия «${product.name}» не настроена цена`);

    const area = calculateArea(product.calculationMethod, item.dimensions, item.quantity);
    const baseNetRate = thickness.metalCost * rate.materialMultiplier + rate.laborCost;
    const netUnitPrice = roundRate(baseNetRate * coefficient);
    const grossUnitPrice = roundRate(netUnitPrice * taxMultiplier);
    const netTotal = roundMoney(area * netUnitPrice);
    const grossTotal = catalog.tax.enabled ? grossMoney(netTotal, catalog.tax.rate) : netTotal;

    return {
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      description: description(product.name, product.calculationMethod, item.dimensions, item.thicknessCode),
      dimensions: item.dimensions,
      thicknessCode: item.thicknessCode,
      quantity: item.quantity,
      area,
      netUnitPrice,
      grossUnitPrice,
      netTotal,
      grossTotal,
      pricingSnapshot: {
        rateId: rate.id,
        tierKey: rate.tierKey,
        boundary,
        metalCost: thickness.metalCost,
        materialMultiplier: rate.materialMultiplier,
        laborCost: rate.laborCost,
        coefficients: catalog.coefficients,
      },
    };
  });

  const subtotal = sumMoney(lines.map((line) => line.netTotal));
  const total = sumMoney(lines.map((line) => line.grossTotal));
  const taxAmount = catalog.tax.enabled
    ? sumMoney(lines.map((line) => roundMoney(line.grossTotal - line.netTotal)))
    : 0;
  return { lines, subtotal, taxAmount, total, tax: catalog.tax };
}

export function formatInvoiceNumber(pattern: string, value: number, year: number) {
  const withYear = pattern.replaceAll("{YEAR}", String(year));
  const formatted = withYear.replace(/\{NUMBER(?::(\d{1,2}))?\}/g, (_, length: string | undefined) =>
    String(value).padStart(length ? Number(length) : 1, "0"));
  if (formatted === withYear) throw new Error("Шаблон должен содержать {NUMBER} или {NUMBER:N}");
  return formatted;
}
