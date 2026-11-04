"use client";

import { useState, type ReactNode } from "react";

interface ChartCardProps {
  id?: string;
  span: 4 | 5 | 7 | 8;
  title: string;
  subtitle: ReactNode;
  legend?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
}

export function ChartCard({ id, span, title, subtitle, legend, chart, table }: ChartCardProps) {
  const [asTable, setAsTable] = useState(false);

  return (
    <article className={`card span-${span}`} id={id}>
      <header className="card-head">
        <div>
          <h2>{title}</h2>
          <p className="muted small">{subtitle}</p>
        </div>
        <button className="link-btn" type="button" aria-pressed={asTable} onClick={() => setAsTable((on) => !on)}>
          {asTable ? "View as chart" : "View as table"}
        </button>
      </header>
      {asTable ? (
        <div className="viz-table">{table}</div>
      ) : (
        <>
          {legend}
          {chart}
        </>
      )}
    </article>
  );
}
