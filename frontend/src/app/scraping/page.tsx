import type { Metadata } from "next";

import { ScrapingView } from "@/components/ScrapingView";

export const metadata: Metadata = { title: "Recolección" };

export default function ScrapingPage() {
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#111827] sm:text-2xl">Recolección web</h1>
        <p className="mt-0.5 text-sm text-[#5A6370]">
          Progreso del spider Scrapy sobre la consulta de registro. Se actualiza cada 15 s mientras la pestaña está activa.
        </p>
      </div>
      <ScrapingView />
    </div>
  );
}
