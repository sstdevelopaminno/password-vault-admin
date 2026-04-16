import type { Metadata } from "next";
import { resolveAdminLocale } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Password Vault Admin",
  description: "Support-center grade admin portal for Password Vault operations",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await resolveAdminLocale();

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
