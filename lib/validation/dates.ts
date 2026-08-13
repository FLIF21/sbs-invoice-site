export function todayInMoscow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

const canonicalDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isCanonicalDate(value: string) {
  const match = canonicalDatePattern.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function canonicalDateValue(value: string) {
  return value === "" || isCanonicalDate(value) ? value : "";
}

export function nextDate(date: string) {
  if (!isCanonicalDate(date)) throw new Error("Дата должна быть в формате YYYY-MM-DD");
  let [year, month, day] = date.split("-").map(Number);
  day += 1;
  if (day > daysInMonth(year, month)) {
    day = 1;
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function issueDateValidationError(issueDate: string, today = todayInMoscow()) {
  if (!issueDate) return "Укажите дату счёта";
  if (!isCanonicalDate(issueDate)) return "Дата счёта должна быть в формате YYYY-MM-DD";
  if (issueDate < today) return "Дата счёта не может быть в прошлом";
  return "";
}

export function dueDateValidationError(issueDate: string, dueDate: string, today = todayInMoscow()) {
  if (!dueDate) return "";
  if (!isCanonicalDate(dueDate)) return "Дата готовности должна быть в формате YYYY-MM-DD";
  if (isCanonicalDate(issueDate) && dueDate < issueDate) return "Дата готовности не может быть раньше даты счёта";
  if (dueDate < today) return "Дата готовности не может быть в прошлом";
  return "";
}

export function minimumDueDate(issueDate: string, today = todayInMoscow()) {
  return isCanonicalDate(issueDate) && issueDate > today ? issueDate : today;
}

export function invoiceDateError(issueDate: string, dueDate: string, today = todayInMoscow()) {
  return issueDateValidationError(issueDate, today) || dueDateValidationError(issueDate, dueDate, today);
}
