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

export function nextDate(date: string) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export function invoiceDateError(issueDate: string, dueDate: string, today = todayInMoscow()) {
  if (!issueDate) return "Укажите дату счёта";
  if (issueDate < today) return "Дата счёта не может быть в прошлом";
  if (dueDate && dueDate < today) return "Дата готовности не может быть в прошлом";
  if (dueDate && dueDate < issueDate) return "Дата готовности не может быть раньше даты счёта";
  return "";
}
