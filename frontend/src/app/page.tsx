import { Suspense } from "react";

import { SearchView } from "@/components/SearchView";
import { Skeleton } from "@/components/ui/primitives";

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
          <Skeleton className="hidden h-96 lg:block lg:w-72" />
          <div className="flex-1 space-y-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-96" />
          </div>
        </div>
      }
    >
      <SearchView />
    </Suspense>
  );
}
