import type { Metadata, Viewport } from "next";
import { Cairo, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["latin", "arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans"
});

/**
 * Afkar's own brand face. It is loaded for the public registration form,
 * which her members see and which should look like her — not like the admin
 * tool the rest of this app is.
 */
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-brand"
});

export const metadata: Metadata = {
  title: "Afkar WhatsApp",
  description: "Member conversations over WhatsApp Business Cloud API"
};

// maximumScale stops iOS from zooming when an input is focused inside the
// native shell; viewportFit lets the layout reach under the notch.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0b3d2e"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${plexArabic.variable} ${cairo.variable}`}>{children}</body>
    </html>
  );
}
