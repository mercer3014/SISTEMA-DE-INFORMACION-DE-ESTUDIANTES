import type { Metadata } from "next";

import { StatsView } from "@/components/StatsView";

export const metadata: Metadata = { title: "Estadísticas" };

export default function EstadisticasPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Estadísticas</h1>
        <p className="mt-0.5 text-sm text-slate-500">Haga clic en una barra para ver esos estudiantes.</p>
      </div>
      <StatsView />
    </div>
  );
}
