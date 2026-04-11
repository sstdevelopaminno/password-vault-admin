import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Password Vault Admin",
  description: "Standalone admin portal for Password Vault",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
