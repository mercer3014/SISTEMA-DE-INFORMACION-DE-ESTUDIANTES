import { Suspense } from "react";

import { SearchView } from "@/components/SearchView";
import { Skeleton } from "@/components/ui/primitives";

export default function Home() {
  return (
    <Suspense fallback={<div className="space-y-5"><Skeleton className="h-36" /><Skeleton className="h-96" /></div>}>
      <SearchView />
    </Suspense>
  );
}
