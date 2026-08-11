type ValidationIssue = {
  path: readonly PropertyKey[];
  message: string;
};

const fieldLabels: Record<string, string> = {
  issueDate: "Дата",
  dueDate: "Требуется к",
  name: "Покупатель",
  email: "Email",
  quantity: "Количество",
  width: "Ширина A",
  height: "Ширина B",
  width2: "Ширина A₂",
  height2: "Ширина B₂",
  diameter: "Диаметр D",
  length: "Длина L",
  radius: "Радиус R",
  angle: "Угол",
};

export function formatValidationIssue(issue: ValidationIssue) {
  const path = issue.path.map(String);
  const itemIndex = path[0] === "items" && /^\d+$/.test(path[1] ?? "") ? Number(path[1]) : null;
  const field = fieldLabels[path.at(-1) ?? ""] ?? "Поле";
  const prefix = itemIndex === null ? "" : `Позиция ${itemIndex + 1}, `;
  return `${prefix}${field}: ${issue.message}`;
}
