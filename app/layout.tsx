import type { Metadata } from "next";
import "./globals.css";
import "./admin.css";

export const metadata: Metadata = {
  title: "СБС Счёт — калькулятор воздуховодов",
  description: "Расчёт стоимости изделий и формирование счёта в PDF и Excel.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru" suppressHydrationWarning><body>{children}</body></html>;
}
