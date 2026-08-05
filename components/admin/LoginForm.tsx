"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Не удалось войти");
      router.replace("/admin");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  return <main className="login-page">
    <Link href="/" className="login-brand"><span>СБС</span> Управление</Link>
    <form className="login-card" onSubmit={submit}>
      <p className="admin-kicker">ЗАЩИЩЁННАЯ ЗОНА</p>
      <h1>Вход в систему</h1>
      <p>Цены, счета, клиенты и настройки доступны только авторизованным сотрудникам.</p>
      <label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Пароль<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <div className="admin-alert error">{error}</div>}
      <button className="primary-button" disabled={busy}>{busy ? "Проверяем…" : "Войти"}</button>
      <Link href="/">← Вернуться к калькулятору</Link>
    </form>
  </main>;
}
