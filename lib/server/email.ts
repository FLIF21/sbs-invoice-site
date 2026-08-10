import "server-only";
import nodemailer from "nodemailer";
import { getMailEnv } from "./env";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export async function sendPasswordResetEmail(input: { email: string; name: string; token: string }) {
  const env = getMailEnv();
  const resetUrl = new URL("/admin/reset-password", env.appUrl);
  resetUrl.searchParams.set("token", input.token);
  const requestId = input.token.slice(0, 8).toUpperCase();
  const subject = `Восстановление пароля — СБС Управление · ${requestId}`;
  const text = `Здравствуйте, ${input.name}. Для смены пароля откройте ссылку: ${resetUrl.toString()}\n\nНомер запроса: ${requestId}. Ссылка действует 30 минут. Если вы не запрашивали восстановление, проигнорируйте письмо.`;
  const html = `<p>Здравствуйте, ${escapeHtml(input.name)}.</p><p>Для смены пароля нажмите кнопку:</p><p><a href="${escapeHtml(resetUrl.toString())}" style="display:inline-block;padding:12px 18px;background:#22302b;color:#fff;text-decoration:none;font-weight:700">Сменить пароль</a></p><p>Номер запроса: <strong>${requestId}</strong>.</p><p>Ссылка действует 30 минут. Если вы не запрашивали восстановление, проигнорируйте письмо.</p>`;

  if (env.provider === "resend") {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.from, to: [input.email], subject, text, html }),
    });
    if (!response.ok) throw new Error(`Resend rejected email with status ${response.status}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.host,
    port: env.port,
    secure: env.secure,
    auth: { user: env.user, pass: env.password },
  });

  await transporter.sendMail({
    from: env.from,
    to: input.email,
    subject,
    text,
    html,
  });
}
