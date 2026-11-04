"use client";

import { useMemo, type CSSProperties } from "react";
import type { DashboardResponse } from "@/lib/dashboard";
import { ChartCard } from "./chart-card";
import { bucketRequests, busiestSlot, heatLevel, visibleHours, WEEKDAYS } from "./chart-math";
import { DataTable } from "./data-table";
import { formatNumber, hourLabel } from "./format";
import { useTooltip } from "./tooltip";

export function HeatCard({ data }: { data: DashboardResponse }) {
  const tooltip = useTooltip();
  const counts = useMemo(() => bucketRequests(data.requested_times, data.time_zone), [data.requested_times, data.time_zone]);
  const max = Math.max(0, ...counts.flat());
  const empty = <p className="empty">No appointment requests in this range yet.</p>;

  if (!max) {
    return <ChartCard id="card-heat" span={7} title="When callers want to come in" subtitle="Requested appointment times" chart={empty} table={empty} />;
  }

  const hours = visibleHours(counts);
  const rowStyle = { "--cols": hours.length } as CSSProperties;
  const best = busiestSlot(counts);

  const chart = (
    <div className="viz">
      <div className="heat" role="img" aria-label="Heatmap of requested appointment times by weekday and hour. Use the table view for the numbers.">
        <div className="heat-row" style={rowStyle}>
          <span />
          {hours.map((hour) => (
            <span className="heat-hour" key={hour}>
              {hourLabel(hour)}
            </span>
          ))}
        </div>
        {WEEKDAYS.map((day, dayIndex) => (
          <div className="heat-row" style={rowStyle} key={day}>
            <span className="heat-day">{day}</span>
            {hours.map((hour) => {
              const value = counts[dayIndex]?.[hour] ?? 0;
              return (
                <span
                  key={hour}
                  className="heat-cell"
                  data-level={heatLevel(value, max)}
                  onPointerMove={(e) =>
                    tooltip.show(e.clientX, e.clientY, `${day} ${hourLabel(hour)}–${hourLabel(hour + 1)}`, [
                      { value: formatNumber(value), label: value === 1 ? "request" : "requests" },
                    ])
                  }
                  onPointerLeave={tooltip.hide}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="heat-scale">
        Fewer
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        More
      </div>
    </div>
  );

  return (
    <ChartCard
      id="card-heat"
      span={7}
      title="When callers want to come in"
      subtitle={`${formatNumber(data.requested_times.length)} requests · busiest ${best.weekday} ${hourLabel(best.hour)} (${best.value}) · ${data.time_zone.replace("_", " ")}`}
      chart={chart}
      table={
        <DataTable
          columns={[{ label: "Hour" }, ...WEEKDAYS.map((day) => ({ label: day, numeric: true }))]}
          rows={hours.map((hour) => [`${hourLabel(hour)}–${hourLabel(hour + 1)}`, ...WEEKDAYS.map((_, dayIndex) => formatNumber(counts[dayIndex]?.[hour] ?? 0))])}
        />
      }
    />
  );
}
