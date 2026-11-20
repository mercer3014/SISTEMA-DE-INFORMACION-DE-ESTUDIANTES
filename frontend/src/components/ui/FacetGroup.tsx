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
  initialLimit = 10,
  searchable = false,
  searchPlaceholder = "Filtrar...",
}: {
  title: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClearGroup?: () => void;
  initialLimit?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [filterText, setFilterText] = useState("");

  const filtered = useMemo(() => {
    const q = normText(filterText);
    if (!q) return options;
    return options.filter((o) => normText(o.label).includes(q));
  }, [options, filterText]);

  const visible = useMemo(() => {
    if (expanded || filterText.trim() !== "" || filtered.length <= initialLimit) {
      return filtered;
    }
    const selSet = new Set(selected);
    const pinned = filtered.filter((o) => selSet.has(o.value));
    const rest = filtered.filter((o) => !selSet.has(o.value));
    const slots = Math.max(0, initialLimit - pinned.length);
    return [...pinned, ...rest.slice(0, slots)];
  }, [expanded, filterText, filtered, initialLimit, selected]);

  const canToggleMore = filterText.trim() === "" && filtered.length > initialLimit;
  const hiddenCount = Math.max(0, filtered.length - visible.length);

  return (
    <section aria-label={title} className="space-y-2.5">
      <div className="flex items-center justify-between gap-2 border-b border-[#E4E6EA] pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#166534]">{title}</h3>
        {selected.length > 0 && onClearGroup && (
          <button
            type="button"
            onClick={onClearGroup}
            className="cursor-pointer text-xs font-medium text-[#5A6370] hover:text-[#166534] hover:underline"
          >
            Limpiar
          </button>
        )}
      </div>

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

      {visible.length === 0 ? (
        <p className="py-1 text-xs text-[#5A6370]">Sin coincidencias</p>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <li key={opt.value}>
                <label className="group flex cursor-pointer items-start gap-2 rounded py-0.5 text-[13px] leading-snug text-[#111827] select-none hover:text-[#166534]">
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

      {canToggleMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex cursor-pointer items-center gap-1 pt-0.5 text-xs font-medium text-[#166534] hover:underline"
        >
          <span>{expanded ? "Ver menos" : `Ver más (${fmtNum(hiddenCount)})`}</span>
          {expanded ? <CaretUp size={12} weight="bold" aria-hidden /> : <CaretDown size={12} weight="bold" aria-hidden />}
        </button>
      )}
    </section>
  );
}
