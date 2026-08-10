"use client";

import Link from "next/link";
import { useState } from "react";

export function PasswordResetRequestForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "Не удалось отправить письмо");
      setMessage(result.message || "Проверьте почту");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось отправить письмо");
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-page">
    <Link href="/" className="login-brand"><span>СБС</span> Управление</Link>
    <form className="login-card" onSubmit={submit}>
      <p className="admin-kicker">ВОССТАНОВЛЕНИЕ ДОСТУПА</p>
      <h1>Забыли пароль?</h1>
      <p>Укажите email сотрудника. Мы отправим одноразовую ссылку, которая действует 30 минут.</p>
      <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      {message && <div className="admin-alert">{message}</div>}
      {error && <div className="admin-alert error">{error}</div>}
      <button className="primary-button" disabled={busy}>{busy ? "Отправляем…" : "Получить ссылку"}</button>
      <Link href="/admin/login">← Вернуться ко входу</Link>
    </form>
  </main>;
}
