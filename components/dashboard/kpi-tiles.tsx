"use client";

import type { DashboardResponse } from "@/lib/dashboard";
import { AnimatedNumber } from "./animated-number";
import { formatNumber, percent } from "./format";
import { useElementWidth } from "./use-element-width";

type Series = "stored" | "duplicates" | "invalid" | "unauthorized";

interface Kpi {
  id: string;
  label: string;
  slot: 1 | 2 | 3 | 4;
  series: Series;
  value: (data: DashboardResponse) => number;
  note: (data: DashboardResponse) => string;
}

const KPIS: Kpi[] = [
  {
    id: "stored24",
    label: "Stored in the last 24 hours",
    slot: 1,
    series: "stored",
    value: (d) => d.totals.last_24h,
    note: (d) => `${formatNumber(d.daily[d.daily.length - 1]?.stored ?? 0)} so far today`,
  },
  {
    id: "duplicates",
    label: "Duplicates blocked",
    slot: 2,
    series: "duplicates",
    value: (d) => d.totals.duplicates,
    note: (d) => `${percent(d.totals.duplicates, d.totals.stored + d.totals.duplicates)}% of valid deliveries were retries`,
  },
  {
    id: "invalid",
    label: "Rejected as invalid",
    slot: 3,
    series: "invalid",
    value: (d) => d.totals.invalid,
    note: () => "Failed validation, nothing stored",
  },
  {
    id: "unauthorized",
    label: "Bad signatures blocked",
    slot: 4,
    series: "unauthorized",
    value: (d) => d.totals.unauthorized,
    note: () => "Not signed with the shared secret",
  },
];

const SPARK_HEIGHT = 38;
const SPARK_PAD = 6;

function Sparkline({ values, slot }: { values: number[]; slot: number }) {
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const width = Math.max(80, measured);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const x = (i: number) => SPARK_PAD + ((width - SPARK_PAD * 2) * i) / Math.max(1, values.length - 1);
  const y = (v: number) => (high === low ? SPARK_HEIGHT / 2 : SPARK_HEIGHT - SPARK_PAD - ((SPARK_HEIGHT - SPARK_PAD * 2) * (v - low)) / (high - low));
  const last = values.length - 1;

  return (
    <div ref={ref}>
      {measured > 0 && (
        <svg className="spark" viewBox={`0 0 ${width} ${SPARK_HEIGHT}`} role="img" aria-label={`Daily trend, latest ${values[last]}`}>
          <polyline className="spark-line" points={values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} fill="none" />
          <circle className={`spark-dot d${slot}`} cx={x(last).toFixed(1)} cy={y(values[last] ?? 0).toFixed(1)} r={4} />
        </svg>
      )}
    </div>
  );
}

export function KpiTiles({ data }: { data: DashboardResponse }) {
  return (
    <section className="kpis" aria-label="Key numbers">
      {KPIS.map((kpi) => (
        <article className="card kpi" key={kpi.id}>
          <div className="kpi-label">
            <span className={`kpi-key bg${kpi.slot}`} />
            {kpi.label}
          </div>
          <AnimatedNumber className="kpi-value" value={kpi.value(data)} />
          <div className="kpi-note">{kpi.note(data)}</div>
          <Sparkline values={data.daily.map((day) => day[kpi.series])} slot={kpi.slot} />
        </article>
      ))}
    </section>
  );
}
