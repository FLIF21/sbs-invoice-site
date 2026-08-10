"use client";

import Link from "next/link";
import { useState } from "react";
import { PasswordField } from "./PasswordField";

export function PasswordResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Пароли не совпадают");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Не удалось изменить пароль");
      setComplete(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось изменить пароль");
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-page">
    <Link href="/" className="login-brand"><span>СБС</span> Управление</Link>
    <form className="login-card" onSubmit={submit}>
      <p className="admin-kicker">НОВЫЙ ПАРОЛЬ</p>
      <h1>{complete ? "Пароль изменён" : "Создайте пароль"}</h1>
      {complete ? <>
        <div className="admin-alert">Все прежние сессии завершены. Теперь можно войти с новым паролем.</div>
        <Link className="primary-button login-primary-link" href="/admin/login">Перейти ко входу</Link>
      </> : <>
        <p>Не менее 12 символов, включая заглавную букву и цифру.</p>
        <PasswordField label="Новый пароль" autoComplete="new-password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} />
        <PasswordField label="Повторите пароль" autoComplete="new-password" required minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        {error && <div className="admin-alert error">{error}</div>}
        <button className="primary-button" disabled={busy || !token}>{busy ? "Сохраняем…" : "Сохранить пароль"}</button>
        {!token && <div className="admin-alert error">В ссылке отсутствует токен восстановления.</div>}
      </>}
      <Link href="/admin/login">← Вернуться ко входу</Link>
    </form>
  </main>;
}
