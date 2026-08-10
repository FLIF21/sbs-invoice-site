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

  const transporter = nodemailer.createTransport({
    host: env.host,
    port: env.port,
    secure: env.secure,
    auth: { user: env.user, pass: env.password },
  });

  await transporter.sendMail({
    from: env.from,
    to: input.email,
    subject: "Восстановление пароля — СБС Управление",
    text: `Здравствуйте, ${input.name}. Для смены пароля откройте ссылку: ${resetUrl.toString()}\n\nСсылка действует 30 минут. Если вы не запрашивали восстановление, проигнорируйте письмо.`,
    html: `<p>Здравствуйте, ${escapeHtml(input.name)}.</p><p>Для смены пароля нажмите кнопку:</p><p><a href="${escapeHtml(resetUrl.toString())}" style="display:inline-block;padding:12px 18px;background:#22302b;color:#fff;text-decoration:none;font-weight:700">Сменить пароль</a></p><p>Ссылка действует 30 минут. Если вы не запрашивали восстановление, проигнорируйте письмо.</p>`,
  });
}
