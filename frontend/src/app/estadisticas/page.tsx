import type { Metadata } from "next";

import { StatsView } from "@/components/StatsView";

export const metadata: Metadata = { title: "Estadísticas" };

export default function EstadisticasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Estadísticas</h1>
        <p className="text-sm text-slate-500">Haga clic en una barra para ver esos estudiantes.</p>
      </div>
      <StatsView />
    </div>
  );
}
