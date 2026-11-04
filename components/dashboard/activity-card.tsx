"use client";

import { Icon } from "@/components/icons";
import type { DashboardResponse } from "@/lib/dashboard";
import { feedText, timeAgo } from "./format";
import { OUTCOMES } from "./outcomes";
import { useNow } from "./use-now";

interface ActivityCardProps {
  data: DashboardResponse;
  freshIds: ReadonlySet<number>;
}

export function ActivityCard({ data, freshIds }: ActivityCardProps) {
  const now = useNow();

  return (
    <article className="card span-5" id="activity">
      <header className="card-head">
        <div>
          <h2>Live activity</h2>
          <p className="muted small">Newest first</p>
        </div>
      </header>
      <ul className="feed" aria-live="polite">
        {data.feed.length === 0 && <li className="empty">Nothing has arrived yet.</li>}
        {data.feed.map((item) => {
          const outcome = OUTCOMES[item.outcome];
          const [title, detail] = feedText(item, data.time_zone);
          return (
            <li className={`feed-row${freshIds.has(item.id) ? " is-new" : ""}`} key={item.id}>
              <span className={`pill t${outcome.slot}`}>
                <Icon name={outcome.icon} />
                {outcome.short}
              </span>
              <div className="feed-main">
                <div className="feed-title">{title}</div>
                <div className="feed-sub">{detail}</div>
              </div>
              <span className="feed-time">{timeAgo(item.at, now)}</span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
