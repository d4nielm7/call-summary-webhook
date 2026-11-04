"use client";

import { RANGE_DAYS } from "@/lib/dashboard";
import { timeAgo } from "./format";
import { useNow } from "./use-now";

interface TopBarProps {
  timeZone: string;
  days: number;
  online: boolean;
  lastOk: number;
  onDaysChange: (days: number) => void;
}

export function TopBar({ timeZone, days, online, lastOk, onDaysChange }: TopBarProps) {
  const now = useNow();
  const liveText = !online ? "Offline · retrying" : lastOk ? `Live · updated ${timeAgo(new Date(lastOk).toISOString(), now)}` : "Connecting…";

  return (
    <header className="top">
      <div>
        <h1>Overview</h1>
        <p className="muted">Calls the AI receptionist has handed over · clinic time, {timeZone.replace("_", " ")}</p>
      </div>
      <div className="filters">
        <span className={`live ${online ? "is-live" : "is-off"}`}>
          <span className="live-dot" />
          <span>{liveText}</span>
        </span>
        <div className="segmented" role="group" aria-label="Date range">
          {RANGE_DAYS.map((range) => (
            <button key={range} type="button" aria-pressed={range === days} onClick={() => onDaysChange(range)}>
              {range} days
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
