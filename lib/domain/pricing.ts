import type {
  CalculatedLine,
  CalculatedQuote,
  ProductDimensions,
  PublicCatalog,
  QuoteItemInput,
} from "./types";

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const precise = (value: number) => Math.round((value + Number.EPSILON) * 10_000) / 10_000;

function positive(value: number | undefined, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Поле «${field}» должно быть больше нуля`);
  }
  return value;
}

export function calculateArea(method: string, dimensions: ProductDimensions, quantity: number) {
  const qty = positive(quantity, "Количество");
  const width = dimensions.width;
  const height = dimensions.height;
  const length = dimensions.length;
  let unitArea: number;

  switch (method) {
    case "RECTANGULAR_ELBOW": {
      const a = positive(width, "Ширина");
      const b = positive(height, "Высота");
      const radius = positive(dimensions.radius, "Радиус");
      const angle = positive(dimensions.angle, "Угол");
      unitArea = (angle * Math.PI / 180) * (2 * (a + b)) * (a / 2 + radius) / 1_000_000;
      break;
    }
    case "RECTANGULAR_TRANSITION": {
      const a = positive(width, "Ширина A");
      const b = positive(height, "Ширина B");
      const a2 = positive(dimensions.width2, "Ширина A₂");
      const b2 = positive(dimensions.height2, "Ширина B₂");
      const l = positive(length, "Длина");
      const averagePerimeter = (2 * (a + b) + 2 * (a2 + b2)) / 2;
      const slant = Math.sqrt(l ** 2 + ((Math.hypot(a, b) - Math.hypot(a2, b2)) / 2) ** 2);
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
      const a = positive(width, "Ширина");
      const b = positive(height, "Высота");
      const l = positive(length, "Длина");
      unitArea = (2 * (a + b) * l + a * b) / 1_000_000;
      break;
    }
    case "CUSTOM_AREA":
      unitArea = positive(dimensions.area, "Площадь");
      break;
    default: {
      const a = positive(width, "Ширина");
      const b = positive(height, "Высота");
      const l = positive(length, "Длина");
      unitArea = 2 * (a + b) * l / 1_000_000;
    }
  }

  return precise(unitArea * qty);
}

function boundaryFor(method: string, dimensions: ProductDimensions) {
  if (method === "RECTANGULAR_ELBOW") {
    return 2 * (positive(dimensions.width, "Ширина") + positive(dimensions.height, "Высота"));
  }
  if (method === "RECTANGULAR_TRANSITION") {
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
    const netUnitPrice = precise(baseNetRate * coefficient);
    const grossUnitPrice = precise(netUnitPrice * taxMultiplier);
    const netTotal = money(area * netUnitPrice);
    const grossTotal = money(area * grossUnitPrice);

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

  const subtotal = money(lines.reduce((sum, line) => sum + line.netTotal, 0));
  const total = catalog.tax.enabled ? money(lines.reduce((sum, line) => sum + line.grossTotal, 0)) : subtotal;
  return { lines, subtotal, taxAmount: money(total - subtotal), total, tax: catalog.tax };
}

export function formatInvoiceNumber(pattern: string, value: number, year: number) {
  const withYear = pattern.replaceAll("{YEAR}", String(year));
  const formatted = withYear.replace(/\{NUMBER(?::(\d{1,2}))?\}/g, (_, length: string | undefined) =>
    String(value).padStart(length ? Number(length) : 1, "0"));
  if (formatted === withYear) throw new Error("Шаблон должен содержать {NUMBER} или {NUMBER:N}");
  return formatted;
}
