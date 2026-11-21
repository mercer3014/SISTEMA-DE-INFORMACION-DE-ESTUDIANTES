"use client";

import { CaretDown, CaretUp, Check, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useMemo, useState } from "react";

import { cn, fmtNum, normText } from "@/lib/format";

export interface FacetOption {
  value: string;
  label: string;
  count?: number | null;
}

export function FacetGroup({
  title,
  options,
  selected,
  onToggle,
  onClearGroup,
  searchable = false,
  searchPlaceholder = "Filtrar...",
  defaultOpen = true,
  openSignal,
}: {
  title: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClearGroup?: () => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  defaultOpen?: boolean;
  openSignal?: { open: boolean; seq: number };
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [lastSeq, setLastSeq] = useState(openSignal?.seq ?? 0);
  const [filterText, setFilterText] = useState("");

  if (openSignal && openSignal.seq !== lastSeq) {
    setLastSeq(openSignal.seq);
    setOpen(openSignal.open);
  }

  const filtered = useMemo(() => {
    const q = normText(filterText);
    if (!q) return options;
    return options.filter((o) => normText(o.label).includes(q));
  }, [options, filterText]);

  return (
    <section aria-label={title} className="space-y-2.5">
      <div className="flex items-center justify-between gap-2 border-b border-[#E4E6EA] pb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#166534] group-hover:text-[#114B26]">
              {title}
            </span>
            {selected.length > 0 && (
              <span className="rounded bg-[#F0F7F2] px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-[#166534] ring-1 ring-inset ring-[#C4DEC9]">
                {selected.length}
              </span>
            )}
          </span>
          {open ? (
            <CaretUp size={13} weight="bold" aria-hidden className="shrink-0 text-[#5A6370] group-hover:text-[#111827]" />
          ) : (
            <CaretDown size={13} weight="bold" aria-hidden className="shrink-0 text-[#5A6370] group-hover:text-[#111827]" />
          )}
        </button>

        {selected.length > 0 && onClearGroup && (
          <button
            type="button"
            onClick={onClearGroup}
            className="shrink-0 cursor-pointer text-xs font-medium text-[#5A6370] hover:text-[#166534] hover:underline"
          >
            Limpiar
          </button>
        )}
      </div>

      {open && (
        <>
          {searchable && (
            <div className="relative">
              <MagnifyingGlass
                size={13}
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5A6370]"
              />
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={`Filtrar opciones de ${title}`}
                className={cn(
                  "h-8 w-full rounded border border-[#E4E6EA] bg-[#FAFAFA] pl-7 text-xs text-[#111827] outline-none transition placeholder:text-[#5A6370] focus:border-[#166534] focus:bg-white",
                  filterText ? "pr-7" : "pr-2.5",
                )}
              />
              {filterText && (
                <button
                  type="button"
                  onClick={() => setFilterText("")}
                  aria-label={`Limpiar filtro de ${title}`}
                  className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 cursor-pointer place-items-center rounded text-[#5A6370] hover:bg-[#ECEEF0] hover:text-[#111827]"
                >
                  <X size={11} weight="bold" aria-hidden />
                </button>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="py-1 text-xs text-[#5A6370]">Sin coincidencias</p>
          ) : (
            <ul
              className={cn(
                "space-y-1.5",
                options.length > 14 && "max-h-60 overflow-y-auto pr-1",
              )}
            >
              {filtered.map((opt) => {
                const checked = selected.includes(opt.value);
                return (
                  <li key={opt.value}>
                    <label className="group relative flex cursor-pointer items-start gap-2 rounded py-0.5 text-[13px] leading-snug text-[#111827] select-none hover:text-[#166534]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(opt.value)}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#166534]",
                          checked
                            ? "border-[#166534] bg-[#166534] text-white"
                            : "border-[#CBD2D9] bg-white text-transparent group-hover:border-[#166534]",
                        )}
                      >
                        <Check size={11} weight="bold" />
                      </span>
                      <span className={cn("min-w-0 flex-1 break-words", checked && "font-medium text-[#166534]")}>
                        {opt.label}
                        {opt.count !== undefined && opt.count !== null && (
                          <span className="ml-1 font-mono text-xs font-normal tabular-nums text-[#5A6370]">
                            ({fmtNum(opt.count)})
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
