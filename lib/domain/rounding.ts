function assertFinite(value: number) {
  if (!Number.isFinite(value)) throw new Error("Числовое значение должно быть конечным");
}

export function roundDecimal(value: number, digits: number) {
  assertFinite(value);
  if (!Number.isInteger(digits) || digits < 0 || digits > 10) throw new Error("Некорректная точность округления");
  const [coefficient, exponent = "0"] = String(value).split("e");
  const shifted = Number(`${coefficient}e${Number(exponent) + digits}`);
  return Number(`${Math.round(shifted)}e-${digits}`);
}

export const roundMoney = (value: number) => roundDecimal(value, 2);
export const roundArea = (value: number) => roundDecimal(value, 4);
export const roundRate = (value: number) => roundDecimal(value, 4);

export function sumMoney(values: number[]) {
  return values.reduce((cents, value) => cents + Math.round(roundMoney(value) * 100), 0) / 100;
}

export function taxMoney(netAmount: number, rate: number) {
  assertFinite(rate);
  return roundMoney(roundMoney(netAmount) * rate / 100);
}

export function grossMoney(netAmount: number, rate: number) {
  return sumMoney([netAmount, taxMoney(netAmount, rate)]);
}
