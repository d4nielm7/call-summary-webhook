"use client";

import type { DashboardResponse } from "@/lib/dashboard";
import type { Outcome } from "@/lib/store";
import { ChartCard } from "./chart-card";
import { DataTable } from "./data-table";
import { formatNumber, percent } from "./format";
import { OUTCOME_ORDER, OUTCOMES } from "./outcomes";
import { useTooltip } from "./tooltip";
import { useElementWidth } from "./use-element-width";

const MIN_LABEL_WIDTH = 58;

function OutcomeBar({ counts, total }: { counts: Record<Outcome, number>; total: number }) {
  const [ref, barWidth] = useElementWidth<HTMLDivElement>();
  const tooltip = useTooltip();
  const present = OUTCOME_ORDER.filter((outcome) => counts[outcome] > 0);

  return (
    <div
      className="segbar"
      ref={ref}
      role="img"
      aria-label={OUTCOME_ORDER.map((outcome) => `${OUTCOMES[outcome].label} ${counts[outcome]}`).join(", ")}
    >
      {present.map((outcome) => {
        const { slot, label } = OUTCOMES[outcome];
        const share = percent(counts[outcome], total);
        const open = (x: number, y: number) =>
          tooltip.show(x, y, label, [{ value: formatNumber(counts[outcome]), label: `${share}% of deliveries`, key: { kind: "box", slot } }]);

        return (
          <div
            key={outcome}
            className={`seg bg${slot}`}
            style={{ flexGrow: counts[outcome], flexBasis: 0 }}
            tabIndex={0}
            aria-label={`${label}: ${counts[outcome]} (${share}%)`}
            onPointerMove={(e) => open(e.clientX, e.clientY)}
            onFocus={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              open(rect.left + rect.width / 2, rect.top);
            }}
            onPointerLeave={tooltip.hide}
            onBlur={tooltip.hide}
          >
            <span>{(barWidth * counts[outcome]) / total >= MIN_LABEL_WIDTH ? `${share}%` : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

export function OutcomesCard({ data }: { data: DashboardResponse }) {
  const { totals } = data;
  const counts: Record<Outcome, number> = {
    created: totals.stored,
    duplicate: totals.duplicates,
    invalid: totals.invalid,
    unauthorized: totals.unauthorized,
  };
  const total = OUTCOME_ORDER.reduce((sum, outcome) => sum + counts[outcome], 0);

  const chart = total ? (
    <div className="viz">
      <OutcomeBar counts={counts} total={total} />
      <ul className="legend">
        {OUTCOME_ORDER.map((outcome) => (
          <li key={outcome}>
            <span className={`key-box bg${OUTCOMES[outcome].slot}`} />
            {OUTCOMES[outcome].label}
          </li>
        ))}
      </ul>
      <p className="callout">
        <strong>{formatNumber(totals.duplicates)} retries</strong> were absorbed instead of stored twice (
        {percent(totals.duplicates, totals.stored + totals.duplicates)}% of valid deliveries).{" "}
        <strong>{formatNumber(totals.invalid + totals.unauthorized)}</strong> more were refused outright.
      </p>
    </div>
  ) : (
    <p className="empty">No deliveries in this range yet.</p>
  );

  return (
    <ChartCard
      id="card-outcomes"
      span={4}
      title="Where deliveries ended up"
      subtitle="Every webhook received"
      chart={chart}
      table={
        <DataTable
          columns={[{ label: "Outcome" }, { label: "Deliveries", numeric: true }, { label: "Share", numeric: true }]}
          rows={OUTCOME_ORDER.map((outcome) => [OUTCOMES[outcome].label, formatNumber(counts[outcome]), `${percent(counts[outcome], total)}%`])}
        />
      }
    />
  );
}
