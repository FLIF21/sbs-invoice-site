import { PasswordResetForm } from "@/components/admin/PasswordResetForm";

export const metadata = { title: "Новый пароль — СБС Управление" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <PasswordResetForm token={token} />;
}
