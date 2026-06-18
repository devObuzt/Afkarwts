import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Afkar WhatsApp",
  description: "Member conversations over WhatsApp Business Cloud API"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

