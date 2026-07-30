import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "СБС Счёт — калькулятор воздуховодов",
  description: "Расчёт стоимости изделий и формирование счёта в PDF.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
