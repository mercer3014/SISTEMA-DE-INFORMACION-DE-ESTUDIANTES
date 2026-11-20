import type { Metadata } from "next";

import { ScrapingView } from "@/components/ScrapingView";

export const metadata: Metadata = { title: "Recolección" };

export default function ScrapingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Recolección web (scraping)</h1>
        <p className="text-sm text-slate-500">Progreso de la recolección desde la fuente web. Se actualiza cada 15 s.</p>
      </div>
      <ScrapingView />
    </div>
  );
}
