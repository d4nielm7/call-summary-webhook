"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

export interface TipRow {
  value: string;
  label: string;
  key?: { kind: "line" | "box"; slot: number };
}

interface TipState {
  x: number;
  y: number;
  title: string;
  rows: TipRow[];
}

interface TooltipApi {
  show: (x: number, y: number, title: string, rows: TipRow[]) => void;
  hide: () => void;
}

const TooltipContext = createContext<TooltipApi | null>(null);

export function useTooltip(): TooltipApi {
  const api = useContext(TooltipContext);
  if (!api) throw new Error("useTooltip needs a TooltipProvider");
  return api;
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<TipState | null>(null);
  const element = useRef<HTMLDivElement>(null);

  const api = useMemo<TooltipApi>(
    () => ({
      show: (x, y, title, rows) => setTip({ x, y, title, rows }),
      hide: () => setTip(null),
    }),
    [],
  );

  useLayoutEffect(() => {
    const node = element.current;
    if (!tip || !node) return;
    const box = node.getBoundingClientRect();
    let left = tip.x + 14;
    let top = tip.y - box.height - 12;
    if (left + box.width > window.innerWidth - 8) left = tip.x - box.width - 14;
    if (top < 8) top = tip.y + 16;
    node.style.left = `${Math.max(8, left)}px`;
    node.style.top = `${top}px`;
  }, [tip]);

  return (
    <TooltipContext value={api}>
      {children}
      {tip && (
        <div className="tip" role="status" ref={element}>
          <div className="tip-title">{tip.title}</div>
          {tip.rows.map((row) => (
            <div className="tip-row" key={row.label}>
              {row.key && <span className={row.key.kind === "line" ? `key-line c${row.key.slot}` : `key-box bg${row.key.slot}`} />}
              <span className="tip-val">{row.value}</span>
              <span className="tip-label">{row.label}</span>
            </div>
          ))}
        </div>
      )}
    </TooltipContext>
  );
}
