"use client";

import { useState } from "react";
import Link from "next/link";

export function TestPaymentForm({ paymentId, alreadyPaid }: { paymentId: string; alreadyPaid: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function complete() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/test/payments/${encodeURIComponent(paymentId)}/complete`, { method: "POST" });
      const result = await response.json() as { returnUrl?: string; error?: string };
      if (!response.ok || !result.returnUrl) throw new Error(result.error || "Не удалось завершить тестовый платёж");
      window.location.assign(result.returnUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось завершить тестовый платёж");
      setBusy(false);
    }
  }

  if (alreadyPaid) return <Link className="test-payment-button" href="/">Вернуться к счёту</Link>;
  return <>
    {error && <p className="test-payment-error" role="alert">{error}</p>}
    <button className="test-payment-button" type="button" disabled={busy} onClick={complete}>
      {busy ? "Подтверждаем…" : "Имитировать успешную оплату"}
    </button>
  </>;
}
