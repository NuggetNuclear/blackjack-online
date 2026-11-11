import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/shared/i18n/useLanguage";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export const metadata: Metadata = {
  title: "Blackjack Online - Play with Friends",
  description: "Online multiplayer blackjack game. Create a room and play with friends!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
