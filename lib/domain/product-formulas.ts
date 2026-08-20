import type { CalculationMethod, ProductDimensions } from "./types";

export const productFormulaKeys = [
  "rectangular-duct",
  "rectangular-elbow",
  "rectangular-transition",
  "round-transition",
  "round-damper",
  "rectangular-damper",
  "custom-area",
] as const;

export type ProductFormulaKey = typeof productFormulaKeys[number];

export type ProductFormula = {
  key: ProductFormulaKey;
  label: string;
  calculationMethod: CalculationMethod;
  formula: string;
  defaultDimensions: ProductDimensions;
  imagePath: string | null;
};

export const productFormulas: Record<ProductFormulaKey, ProductFormula> = {
  "rectangular-duct": {
    key: "rectangular-duct",
    label: "Прямоугольный воздуховод",
    calculationMethod: "RECTANGULAR_DUCT",
    formula: "S = 2 × (A + B) × L / 1 000 000 × количество",
    defaultDimensions: { width: 400, height: 250, length: 1_500, rail: "20/20" },
    imagePath: "/products/duct.png",
  },
  "rectangular-elbow": {
    key: "rectangular-elbow",
    label: "Прямоугольный отвод",
    calculationMethod: "RECTANGULAR_ELBOW",
    formula: "S = α × π / 180 × 2 × (A + B) × (A / 2 + R) / 1 000 000 × количество",
    defaultDimensions: { width: 400, height: 250, radius: 100, angle: 90, rail: "20/20" },
    imagePath: "/products/elbow.png",
  },
  "rectangular-transition": {
    key: "rectangular-transition",
    label: "Переход прямоугольный → прямоугольный",
    calculationMethod: "RECTANGULAR_TRANSITION",
    formula: "Pср = (2(A + B) + 2(A₂ + B₂)) / 2; l = √(L² + ((√(A² + B²) − √(A₂² + B₂²)) / 2)²); S = Pср × l / 1 000 000 × количество",
    defaultDimensions: { width: 400, height: 250, width2: 300, height2: 200, length: 1_000, rail: "20/20" },
    imagePath: "/products/transition.png",
  },
  "round-transition": {
    key: "round-transition",
    label: "Переход прямоугольный → круглый",
    calculationMethod: "RECTANGULAR_TRANSITION",
    formula: "Pср = (2(A + B) + πD) / 2; l = √(L² + ((√(A² + B²) − πD/(2√2)) / 2)²); S = Pср × l / 1 000 000 × количество",
    defaultDimensions: { width: 400, height: 250, diameter: 300, length: 1_000, rail: "20/20" },
    imagePath: "/products/transition-round.png",
  },
  "round-damper": {
    key: "round-damper",
    label: "Круглая дроссель-заслонка",
    calculationMethod: "ROUND_DAMPER",
    formula: "S = (π × D × L + π × D² / 4) / 1 000 000 × количество",
    defaultDimensions: { width: 300, length: 300 },
    imagePath: "/products/damper-round.png",
  },
  "rectangular-damper": {
    key: "rectangular-damper",
    label: "Прямоугольная дроссель-заслонка",
    calculationMethod: "RECTANGULAR_DAMPER",
    formula: "S = (2 × (A + B) × L + A × B) / 1 000 000 × количество",
    defaultDimensions: { width: 400, height: 250, length: 300 },
    imagePath: "/products/damper-rect.png",
  },
  "custom-area": {
    key: "custom-area",
    label: "Готовая площадь",
    calculationMethod: "CUSTOM_AREA",
    formula: "S = площадь единицы × количество",
    defaultDimensions: { area: 1 },
    imagePath: null,
  },
};

export function productFormulaKey(method: CalculationMethod, dimensions: ProductDimensions): ProductFormulaKey {
  if (method === "RECTANGULAR_TRANSITION") return typeof dimensions.diameter === "number" ? "round-transition" : "rectangular-transition";
  const match = Object.values(productFormulas).find((formula) => formula.calculationMethod === method);
  return match?.key ?? "custom-area";
}
