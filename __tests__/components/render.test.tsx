import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccessGate } from "@/components/dashboard/access-gate";
import { ActivityCard } from "@/components/dashboard/activity-card";
import { CallsCard } from "@/components/dashboard/calls-card";
import { KpiTiles } from "@/components/dashboard/kpi-tiles";
import { OutcomesCard } from "@/components/dashboard/outcomes-card";
import { Rail } from "@/components/dashboard/rail";
import { Spotlight } from "@/components/dashboard/spotlight";
import { TooltipProvider } from "@/components/dashboard/tooltip";
import { TopBar } from "@/components/dashboard/top-bar";
import { SectionNav } from "@/components/section-nav";
import type { DashboardCall, DashboardFeedItem, DashboardResponse } from "@/lib/dashboard";

const call = (n: number, overrides: Partial<DashboardCall> = {}): DashboardCall => ({
  id: `call-${n}`,
  call_id: `c${n}`,
  caller_name: `Caller ${n}`,
  phone: "+15550100123",
  reason: `Reason ${n}`,
  requested_time: "2026-11-10T14:00:00.000Z",
  received_at: "2026-11-03T12:00:00.000Z",
  ...overrides,
});

const feedItem = (id: number, overrides: Partial<DashboardFeedItem> = {}): DashboardFeedItem => ({
  id,
  at: "2026-11-03T12:00:00.000Z",
  outcome: "created",
  matched_on: null,
  caller_name: "Jane Sample",
  reason: "Check-up",
  requested_time: "2026-11-10T14:00:00.000Z",
  ...overrides,
});

function data(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    generated_at: "2026-11-03T15:00:00.000Z",
    time_zone: "America/New_York",
    days: 14,
    demo: false,
    totals: { stored: 3, duplicates: 1, invalid: 1, unauthorized: 0, last_24h: 2 },
    daily: [
      { date: "2026-11-02", stored: 1, duplicates: 0, invalid: 0, unauthorized: 0 },
      { date: "2026-11-03", stored: 2, duplicates: 1, invalid: 1, unauthorized: 0 },
    ],
    calls: [call(1), call(2), call(3)],
    requested_times: ["2026-11-10T14:00:00.000Z"],
    feed: [feedItem(2), feedItem(1)],
    ...overrides,
  };
}

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("CallsCard", () => {
  it("shows caller text as text, never as markup", () => {
    const hostile = call(1, { caller_name: "<img src=x onerror=alert(1)>", reason: `<script>alert("x")</script>` });
    const out = html(<CallsCard data={data({ calls: [hostile] })} freshIds={new Set()} />);

    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("masks phone numbers until asked", () => {
    const out = html(<CallsCard data={data()} freshIds={new Set()} />);
    expect(out).toContain("+1 (•••) •••-0123");
    expect(out).not.toContain("555");
  });

  it("lists the calls with the time they want in the clinic's timezone", () => {
    const out = html(<CallsCard data={data()} freshIds={new Set()} />);
    expect(out).toContain("Caller 1");
    expect(out).toContain("Tue, Nov 10 · 9:00 AM");
  });

  it("shows 12 rows and offers the rest", () => {
    const many = Array.from({ length: 30 }, (_, i) => call(i));
    const out = html(<CallsCard data={data({ calls: many })} freshIds={new Set()} />);
    expect(out.match(/<tr/g)).toHaveLength(13);
    expect(out).toContain("Show 12 more");
  });

  it("does not offer more when everything fits", () => {
    expect(html(<CallsCard data={data()} freshIds={new Set()} />)).not.toContain("more</button>");
  });

  it("says when a range has no calls", () => {
    expect(html(<CallsCard data={data({ calls: [] })} freshIds={new Set()} />)).toContain("No calls in this range yet.");
  });

  it("marks only the rows that just arrived", () => {
    const out = html(<CallsCard data={data()} freshIds={new Set(["call-2"])} />);
    expect(out.match(/class="is-new"/g)).toHaveLength(1);
  });

  it("says how many are shown when the list is capped", () => {
    const out = html(<CallsCard data={data({ totals: { stored: 500, duplicates: 0, invalid: 0, unauthorized: 0, last_24h: 0 } })} freshIds={new Set()} />);
    expect(out).toContain("showing the latest 3");
  });
});

describe("ActivityCard", () => {
  it("shows an outcome pill and a line for each delivery", () => {
    const feed = [
      feedItem(3, { outcome: "duplicate", matched_on: "call_id" }),
      feedItem(2, { outcome: "invalid", caller_name: null }),
      feedItem(1, { outcome: "unauthorized", caller_name: null }),
    ];
    const out = html(<ActivityCard data={data({ feed })} freshIds={new Set()} />);
    for (const text of ["Duplicate", "Rejected", "Bad signature", "Matched on call id", "Invalid payload", "Request refused"]) expect(out).toContain(text);
  });

  it("highlights new deliveries only", () => {
    const out = html(<ActivityCard data={data()} freshIds={new Set([2])} />);
    expect(out.match(/feed-row is-new/g)).toHaveLength(1);
    expect(out.match(/feed-row/g)).toHaveLength(2);
  });

  it("says when nothing has arrived", () => {
    expect(html(<ActivityCard data={data({ feed: [] })} freshIds={new Set()} />)).toContain("Nothing has arrived yet.");
  });

  it("escapes caller text", () => {
    const out = html(<ActivityCard data={data({ feed: [feedItem(1, { caller_name: "<b>x</b>" })] })} freshIds={new Set()} />);
    expect(out).not.toContain("<b>");
  });
});

describe("OutcomesCard", () => {
  const render = (d: DashboardResponse) =>
    html(
      <TooltipProvider>
        <OutcomesCard data={d} />
      </TooltipProvider>,
    );

  it("explains how many retries were absorbed", () => {
    const out = render(data());
    expect(out).toContain("1 retries");
    expect(out).toContain("25%");
  });

  it("counts invalid and unsigned deliveries as refused", () => {
    expect(render(data({ totals: { stored: 5, duplicates: 0, invalid: 2, unauthorized: 3, last_24h: 0 } }))).toContain("<strong>5</strong> more were refused outright");
  });

  it("shows an empty state when nothing was delivered", () => {
    const out = render(data({ totals: { stored: 0, duplicates: 0, invalid: 0, unauthorized: 0, last_24h: 0 } }));
    expect(out).toContain("No deliveries in this range yet.");
    expect(out).not.toContain("segbar");
  });

  it("only draws a segment for outcomes that happened", () => {
    expect(render(data()).match(/class="seg /g)).toHaveLength(3);
  });
});

describe("KpiTiles", () => {
  it("shows the four headline numbers with their explanations", () => {
    const out = html(<KpiTiles data={data()} />);
    for (const text of ["Stored in the last 24 hours", "Duplicates blocked", "Rejected as invalid", "Bad signatures blocked", "2 so far today", "25% of valid deliveries were retries"]) {
      expect(out).toContain(text);
    }
  });
});

describe("Spotlight", () => {
  it("shows the stored count's caption and any extra controls", () => {
    const out = html(
      <Spotlight stored={42} days={30}>
        <button>extra</button>
      </Spotlight>,
    );
    expect(out).toContain("stored in the last 30 days");
    expect(out).toContain("<button>extra</button>");
  });
});

describe("TopBar", () => {
  const render = (props: Partial<React.ComponentProps<typeof TopBar>> = {}) =>
    html(<TopBar timeZone="America/New_York" days={14} online lastOk={0} onDaysChange={() => {}} {...props} />);

  it("marks the selected range", () => {
    const out = render({ days: 30 });
    expect(out).toMatch(/aria-pressed="true"[^>]*>30 days/);
    expect(out).toMatch(/aria-pressed="false"[^>]*>7 days/);
  });

  it("shows the clinic's timezone in plain words", () => {
    expect(render()).toContain("America/New York");
  });

  it("says when the connection is lost", () => {
    const out = render({ online: false });
    expect(out).toContain("Offline · retrying");
    expect(out).toContain("is-off");
  });

  it("says it is connecting before the first response", () => {
    expect(render()).toContain("Connecting…");
  });
});

describe("AccessGate", () => {
  it("asks for the key in a password field", () => {
    const out = html(<AccessGate message="" onSubmit={() => {}} />);
    expect(out).toMatch(/<input[^>]*type="password"/);
    expect(out).not.toContain("gate-error");
  });

  it("shows why the key was refused", () => {
    const out = html(<AccessGate message="That key was not accepted." onSubmit={() => {}} />);
    expect(out).toMatch(/role="alert"[^>]*>That key was not accepted\./);
  });

});

describe("Rail", () => {
  it("only shows the lock button when there is a key to lock", () => {
    expect(html(<Rail demo={false} />)).not.toContain("Lock dashboard");
    expect(html(<Rail demo={false} onLock={() => {}} />)).toContain("Lock dashboard");
  });

  it("says where the data comes from", () => {
    expect(html(<Rail demo={false} />)).toContain("/api/webhooks/call-summary");
    expect(html(<Rail demo />)).toContain("Source · simulated");
    expect(html(<Rail demo={false} />)).not.toContain("simulated");
  });

  it("links every section and the architecture page", () => {
    const out = html(<Rail demo={false} />);
    for (const id of ["overview", "insights", "activity", "calls"]) expect(out).toContain(`href="#${id}"`);
    expect(out).toContain('href="/architecture"');
  });
});

describe("SectionNav", () => {
  const sections = [{ id: "a", label: "First" }, { id: "b", label: "Second" }];

  it("starts on the first section", () => {
    const out = html(<SectionNav sections={sections} />);
    expect(out).toMatch(/class="nav-link is-active"[^>]*>First/);
    expect(out).toMatch(/class="nav-link"[^>]*>Second/);
  });

  it("links to each section by id", () => {
    const out = html(<SectionNav sections={sections} />);
    expect(out).toContain('href="#a"');
    expect(out).toContain('href="#b"');
  });
});
