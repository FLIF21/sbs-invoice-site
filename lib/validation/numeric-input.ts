export type NumericInputResult =
  | { success: true; value: number }
  | { success: false; error: string; missing: boolean };

export const MAX_DIMENSION_VALUE = 1_000_000;
export const MAX_ANGLE_VALUE = 360;
export const MAX_INVOICE_ITEM_QUANTITY = 1_000_000_000;
export const MIN_RECTANGULAR_WIDTH_MM = 150;

function rawText(value: number | string | undefined) {
  return value === undefined ? "" : String(value).trim();
}

export function parsePositiveDecimal(value: number | string | undefined, label: string): NumericInputResult {
  const raw = rawText(value);
  if (!raw) return { success: false, error: `${label}: заполните поле`, missing: true };
  const normalized = raw.replace(",", ".");
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    return { success: false, error: `${label}: введите положительное число`, missing: false };
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { success: false, error: `${label}: значение должно быть больше нуля`, missing: false };
  }
  return { success: true, value: parsed };
}

export function parsePositiveInteger(value: number | string | undefined, label = "Количество"): NumericInputResult {
  const decimal = parsePositiveDecimal(value, label);
  if (!decimal.success) return decimal;
  if (!Number.isInteger(decimal.value)) {
    return { success: false, error: `${label}: укажите целое число не меньше 1`, missing: false };
  }
  return decimal;
}
