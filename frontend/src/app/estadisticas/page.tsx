import type { Metadata } from "next";
import { Suspense } from "react";

import { StatsView } from "@/components/StatsView";
import { Skeleton } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Estadísticas" };

export default function EstadisticasPage() {
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[#111827] sm:text-2xl">Estadísticas</h1>
        <p className="mt-0.5 text-sm text-[#5A6370]">
          Filtra por año, facultad, carrera, sede o género para explorar la distribución del padrón.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
            <Skeleton className="hidden h-96 lg:block lg:w-72" />
            <div className="flex-1 space-y-4">
              <Skeleton className="h-24" />
              <Skeleton className="h-56" />
            </div>
          </div>
        }
      >
        <StatsView />
      </Suspense>
    </div>
  );
}
