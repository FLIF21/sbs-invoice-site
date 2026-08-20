import { notFound } from "next/navigation";
import { formatRub } from "@/lib/domain/format";
import { getTestPaymentPageData } from "@/lib/server/payments";
import { TestPaymentForm } from "./TestPaymentForm";

export const dynamic = "force-dynamic";

export default async function TestPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const payment = await getTestPaymentPageData((await params).id);
  if (!payment) notFound();
  const alreadyPaid = payment.status === "SUCCEEDED" || payment.invoiceStatus === "PAID";
  return <main className="test-payment-page">
    <section className="test-payment-card">
      <span className="test-payment-badge">ТЕСТОВЫЙ РЕЖИМ</span>
      <h1>{alreadyPaid ? "Тестовая оплата выполнена" : "Проверка оплаты"}</h1>
      <p>Счёт № {payment.invoiceNumber}</p>
      <strong>{formatRub(payment.amount)}</strong>
      <div className="test-payment-warning">
        Это имитация платёжной страницы. Банковская карта не запрашивается, реальные деньги не списываются.
      </div>
      <TestPaymentForm paymentId={payment.id} alreadyPaid={alreadyPaid} />
    </section>
  </main>;
}
