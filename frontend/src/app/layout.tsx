import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";

import { Header } from "@/components/Header";
import { APP_NAME } from "@/lib/app";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: `${APP_NAME} · Búsqueda`, template: `%s · ${APP_NAME}` },
  description: "Búsqueda rápida por nombre, registro, CI, facultad, carrera y gestión.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-slate-100/70 text-slate-900">
        <Suspense fallback={<div className="h-16 bg-blue-900" />}>
          <Header />
        </Suspense>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
        <footer className="py-6 text-center text-xs text-slate-400">
          Datos internos · uso responsable
        </footer>
      </body>
    </html>
  );
}
