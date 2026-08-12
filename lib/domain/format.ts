export const formatRub = (value: number) => new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);

export const formatArea = (value: number) => new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 4,
}).format(value);
