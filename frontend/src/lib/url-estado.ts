"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Actualiza la barra de direcciones sin disparar el `restore()` del App Router.
 *
 * Next.js parchea `history.replaceState`. Si el primer argumento no trae la
 * marca interna `__NA` (o `_N`), interpreta el cambio como una travesía de
 * historial: despacha ACTION_RESTORE, puede re-suspender el árbol y remountar
 * la página (el Suspense muestra el skeleton y el input pierde letras).
 * Reutilizar `history.state` (que ya tiene `__NA` tras la hidratación) hace
 * que el parche delegue en el `replaceState` nativo y no toque el router.
 */
export function replaceUrlSilencioso(url: string) {
  window.history.replaceState(window.history.state, "", url);
}

/** Lectura y escritura de query params sin navegar ni remountar la página. */
export function useUrlFiltros(pathname: string) {
  const spInicial = useSearchParams();
  const [qs, setQs] = useState(() => spInicial.toString());

  useEffect(() => {
    const onPop = () => {
      startTransition(() => {
        setQs(new URLSearchParams(window.location.search).toString());
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const sp = useMemo(() => new URLSearchParams(qs), [qs]);
  const get = useCallback((k: string) => sp.get(k) ?? "", [sp]);

  const setParams = useCallback(
    (cambios: Record<string, string | null>, resetPage = true) => {
      const p = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(cambios)) {
        if (v === null || v === "") p.delete(k);
        else p.set(k, v);
      }
      if (resetPage && !("page" in cambios)) p.delete("page");
      const next = p.toString();
      const dest = next ? `${pathname}?${next}` : pathname;
      const here = window.location.pathname + window.location.search;
      if (here === dest) return;
      replaceUrlSilencioso(dest);
      startTransition(() => setQs(next));
    },
    [pathname],
  );

  return { get, setParams, qs };
}
