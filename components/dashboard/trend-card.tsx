"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { DailyCounts, DashboardResponse } from "@/lib/dashboard";
import { ChartCard } from "./chart-card";
import { linePath, niceStep, spreadLabels } from "./chart-math";
import { DataTable } from "./data-table";
import { dayLabel, formatNumber } from "./format";
import { useTooltip } from "./tooltip";
import { useElementWidth } from "./use-element-width";

const HEIGHT = 236;
const WIDE_FROM = 560;

function TrendChart({ daily }: { daily: DailyCounts[] }) {
  const [boxRef, measured] = useElementWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltip = useTooltip();
  const [active, setActive] = useState<number | null>(null);

  const width = Math.max(320, measured);
  const wide = width >= WIDE_FROM;
  const margin = { top: 18, right: wide ? 100 : 14, bottom: 30, left: 36 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = HEIGHT - margin.top - margin.bottom;
  const count = daily.length;

  const peak = Math.max(1, ...daily.map((d) => Math.max(d.stored, d.duplicates)));
  const step = Math.max(1, niceStep(peak / 4));
  const yMax = step * 4;
  const x = (i: number) => margin.left + (count === 1 ? innerWidth / 2 : (innerWidth * i) / (count - 1));
  const y = (v: number) => margin.top + innerHeight - (innerHeight * v) / yMax;

  const storedPath = linePath(daily.map((d, i) => [x(i), y(d.stored)]));
  const duplicatePath = linePath(daily.map((d, i) => [x(i), y(d.duplicates)]));
  const labelEvery = Math.ceil(count / 7);

  const last = daily[count - 1];
  const [storedLabelY, duplicateLabelY] = last ? spreadLabels(y(last.stored), y(last.duplicates)) : [0, 0];

  function show(index: number, clientX: number, clientY: number) {
    const day = daily[index];
    if (!day) return;
    setActive(index);
    tooltip.show(clientX, clientY, dayLabel(day.date, true), [
      { value: formatNumber(day.stored), label: "Stored", key: { kind: "line", slot: 1 } },
      { value: formatNumber(day.duplicates), label: "Duplicates blocked", key: { kind: "line", slot: 2 } },
    ]);
  }

  function hide() {
    setActive(null);
    tooltip.hide();
  }

  function indexAt(clientX: number): number {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return count - 1;
    const px = ((clientX - rect.left) * width) / rect.width;
    return Math.min(count - 1, Math.max(0, Math.round(((px - margin.left) / innerWidth) * (count - 1))));
  }

  function showAtIndex(index: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    show(index, rect.left + (x(index) * rect.width) / width, rect.top + (margin.top * rect.height) / HEIGHT);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = (active ?? count - 1) + (event.key === "ArrowRight" ? 1 : -1);
    showAtIndex(Math.min(count - 1, Math.max(0, next)));
  }

  const activeDay = active === null ? undefined : daily[active];

  return (
    <div className="viz" ref={boxRef}>
      {measured > 0 && (
        <svg
          ref={svgRef}
          className="chart"
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={`Calls stored and duplicates blocked per day over the last ${count} days. Use the table view for the numbers.`}
        >
          {[0, 1, 2, 3, 4].map((tick) => (
            <g key={tick}>
              <line className={tick === 0 ? "axis-line" : "grid-line"} x1={margin.left} x2={width - margin.right} y1={y(step * tick)} y2={y(step * tick)} />
              <text className="tick tick-y" x={margin.left - 8} y={y(step * tick) + 4}>
                {formatNumber(step * tick)}
              </text>
            </g>
          ))}
          {daily.map(
            (day, i) =>
              (count - 1 - i) % labelEvery === 0 && (
                <text key={day.date} className="tick tick-x" x={x(i)} y={HEIGHT - 8}>
                  {dayLabel(day.date)}
                </text>
              ),
          )}
          <path className="area" d={`${storedPath}L${x(count - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`} />
          <path className="line l2" d={duplicatePath} />
          <path className="line l1" d={storedPath} />

          {last && (
            <>
              <circle className="dot d1" cx={x(count - 1)} cy={y(last.stored)} r={4.5} />
              <circle className="dot d2" cx={x(count - 1)} cy={y(last.duplicates)} r={4.5} />
              {wide && (
                <>
                  <text className="end-label" x={x(count - 1) + 12} y={storedLabelY + 4}>
                    Stored {formatNumber(last.stored)}
                  </text>
                  <text className="end-label" x={x(count - 1) + 12} y={duplicateLabelY + 4}>
                    Duplicates {formatNumber(last.duplicates)}
                  </text>
                </>
              )}
            </>
          )}

          {activeDay && active !== null && (
            <g>
              <line className="cross" x1={x(active)} x2={x(active)} y1={margin.top} y2={margin.top + innerHeight} />
              <circle className="dot d1" cx={x(active)} cy={y(activeDay.stored)} r={4.5} />
              <circle className="dot d2" cx={x(active)} cy={y(activeDay.duplicates)} r={4.5} />
            </g>
          )}
          <rect
            className="hit"
            x={margin.left}
            y={margin.top}
            width={innerWidth}
            height={innerHeight}
            tabIndex={0}
            role="group"
            aria-label="Chart readout. Use the left and right arrow keys to move between days."
            onPointerMove={(e: PointerEvent) => show(indexAt(e.clientX), e.clientX, e.clientY)}
            onPointerLeave={hide}
            onFocus={() => showAtIndex(active ?? count - 1)}
            onBlur={hide}
            onKeyDown={onKeyDown}
          />
        </svg>
      )}
    </div>
  );
}

export function TrendCard({ data }: { data: DashboardResponse }) {
  const { daily, totals, time_zone } = data;

  return (
    <ChartCard
      id="card-trend"
      span={8}
      title="Calls over time"
      subtitle={`Per day · ${totals.stored} stored, ${totals.duplicates} duplicates blocked · days in ${time_zone.replace("_", " ")}`}
      legend={
        <ul className="legend">
          <li>
            <span className="key-line c1" />
            Stored
          </li>
          <li>
            <span className="key-line c2" />
            Duplicates blocked
          </li>
        </ul>
      }
      chart={<TrendChart daily={daily} />}
      table={
        <DataTable
          columns={[{ label: "Day" }, { label: "Stored", numeric: true }, { label: "Duplicates", numeric: true }, { label: "Invalid", numeric: true }, { label: "Bad signature", numeric: true }]}
          rows={daily.map((d) => [dayLabel(d.date, true), formatNumber(d.stored), formatNumber(d.duplicates), formatNumber(d.invalid), formatNumber(d.unauthorized)])}
        />
      }
    />
  );
}
