import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { Suspense } from "react";

import { Header } from "@/components/Header";
import { APP_NAME } from "@/lib/app";
import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: { default: `${APP_NAME} · Búsqueda`, template: `%s · ${APP_NAME}` },
  description: "Búsqueda rápida por nombre, registro, CI, facultad, carrera y gestión.",
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${publicSans.variable} ${ibmPlexMono.variable} antialiased`}>
      <body className="min-h-viewport flex flex-col bg-[#FAFAFA] text-[#111827]">
        <Suspense fallback={<div className="h-14 border-b border-[#E4E6EA] bg-white" />}>
          <Header />
        </Suspense>
        <main className="px-safe mx-auto w-full max-w-7xl flex-1 py-4 sm:py-6">{children}</main>
        <footer className="pb-safe px-safe mt-4 border-t border-[#E4E6EA] pt-4 text-center text-xs text-[#5A6370]">
          Datos internos · uso responsable
        </footer>
      </body>
    </html>
  );
}
