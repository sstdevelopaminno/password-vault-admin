import type { Metadata } from "next";
import { Manrope, Noto_Sans_Thai } from "next/font/google";
import { resolveAdminLocale } from "@/lib/i18n";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-ui",
});

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-thai",
});

export const metadata: Metadata = {
  title: "Password Vault Admin",
  description: "Support-center grade admin portal for Password Vault operations",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await resolveAdminLocale();

  return (
    <html lang={locale}>
      <body className={`${manrope.variable} ${notoSansThai.variable}`}>{children}</body>
    </html>
  );
}
