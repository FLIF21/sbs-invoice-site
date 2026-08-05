import type { AdminData } from "@/lib/domain/admin-types";

const rub = (value: number) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value);

export function DashboardSection({ dashboard }: { dashboard: NonNullable<AdminData["dashboard"]> }) {
  const max = Math.max(...dashboard.months.map((item) => item.total), 1);
  return <section className="admin-section">
    <div className="admin-heading"><div><p className="admin-kicker">АНАЛИТИКА</p><h1>Пульс продаж</h1></div><span>Данные обновляются в реальном времени</span></div>
    <div className="metric-grid">
      <article><span>Сегодня</span><strong>{dashboard.today.count}</strong><small>{rub(dashboard.today.total)}</small></article>
      <article><span>За месяц</span><strong>{dashboard.month.count}</strong><small>{rub(dashboard.month.total)}</small></article>
      <article><span>За год</span><strong>{dashboard.year.count}</strong><small>{rub(dashboard.year.total)}</small></article>
      <article><span>Средний счёт</span><strong>{rub(dashboard.all.average)}</strong><small>{dashboard.all.count} всего</small></article>
      <article><span>Новые клиенты</span><strong>{dashboard.newClients}</strong><small>за текущий месяц</small></article>
    </div>
    <div className="dashboard-grid">
      <article className="chart-card">
        <div className="card-heading"><h2>Сумма счетов</h2><span>6 месяцев</span></div>
        <div className="bar-chart">
          {dashboard.months.map((item) => <div className="bar-column" key={item.key} title={rub(item.total)}>
            <div className="bar-value" style={{ height: `${Math.max(4, item.total / max * 100)}%` }}><span>{item.count}</span></div>
            <small>{item.label}</small>
          </div>)}
        </div>
      </article>
      <article className="list-card">
        <div className="card-heading"><h2>Популярные изделия</h2><span>по количеству</span></div>
        {dashboard.popularProducts.length ? dashboard.popularProducts.map((item, index) => <div className="rank-row" key={item.name}>
          <b>{String(index + 1).padStart(2, "0")}</b><span>{item.name}</span><strong>{item.quantity.toLocaleString("ru-RU")}</strong>
        </div>) : <p className="empty-state">Данные появятся после первого счёта.</p>}
      </article>
    </div>
  </section>;
}
