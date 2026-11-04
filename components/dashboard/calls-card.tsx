"use client";

import { useState } from "react";
import type { DashboardResponse } from "@/lib/dashboard";
import { formatNumber, formatPhone, slotText, timeAgo } from "./format";
import { useNow } from "./use-now";

const PAGE_SIZE = 12;

interface CallsCardProps {
  data: DashboardResponse;
  freshIds: ReadonlySet<string>;
}

export function CallsCard({ data, freshIds }: CallsCardProps) {
  const now = useNow();
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [showPhones, setShowPhones] = useState(false);

  const needle = query.trim().toLowerCase();
  const rows = needle
    ? data.calls.filter((call) => call.caller_name.toLowerCase().includes(needle) || call.reason.toLowerCase().includes(needle))
    : data.calls;
  const shown = rows.slice(0, limit);

  const subtitle = needle
    ? `${rows.length} of ${data.calls.length} calls match`
    : `${formatNumber(data.totals.stored)} stored in the last ${data.days} days${data.totals.stored > data.calls.length ? ` · showing the latest ${data.calls.length}` : ""}`;

  return (
    <article className="card span-12" id="calls">
      <header className="card-head card-head-wrap">
        <div>
          <h2>Recent calls</h2>
          <p className="muted small">{subtitle}</p>
        </div>
        <div className="table-tools">
          <label className="search">
            <span className="sr-only">Search calls</span>
            <input
              type="search"
              placeholder="Search name or reason"
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE_SIZE);
              }}
            />
          </label>
          <label className="switch">
            <input type="checkbox" checked={showPhones} onChange={(e) => setShowPhones(e.target.checked)} />
            <span className="switch-track" />
            <span>Show full numbers</span>
          </label>
        </div>
      </header>
      <div className="table-wrap">
        <table className="table calls-table">
          <thead>
            <tr>
              {["Caller", "Phone", "Reason", "Wants to come in", "Received"].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  {needle ? "No calls match that search." : "No calls in this range yet."}
                </td>
              </tr>
            ) : (
              shown.map((call) => (
                <tr key={call.id} className={freshIds.has(call.id) ? "is-new" : undefined}>
                  <td className="who">{call.caller_name}</td>
                  <td className="num" data-label="Phone">
                    {formatPhone(call.phone, showPhones)}
                  </td>
                  <td className="reason" data-label="Reason">
                    {call.reason}
                  </td>
                  <td className="time" data-label="Wants">
                    {slotText(call.requested_time, data.time_zone)}
                  </td>
                  <td className="time" data-label="Received" title={new Date(call.received_at).toLocaleString()}>
                    {timeAgo(call.received_at, now)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <div className="table-foot">
          <button className="btn" type="button" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
            Show {Math.min(PAGE_SIZE, rows.length - limit)} more
          </button>
        </div>
      )}
    </article>
  );
}
