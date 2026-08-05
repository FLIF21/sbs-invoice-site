export async function adminRequest<T = { ok: true }>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() as T & { error?: string } : null;
  if (!response.ok) {
    const message = body && "error" in body && typeof body.error === "string" ? body.error : "Не удалось выполнить операцию";
    throw new Error(message);
  }
  return body as T;
}

export const jsonRequest = (method: "POST" | "PUT" | "DELETE", data?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  ...(data === undefined ? {} : { body: JSON.stringify(data) }),
});
