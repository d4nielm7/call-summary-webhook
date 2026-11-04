import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExchangePanels } from "@/components/exchange";
import { FlowDemo } from "@/components/flow-demo";
import { Pipeline } from "@/components/pipeline";
import { StoredCalls } from "@/components/stored-calls";
import { describeFlow } from "@/lib/flow";
import type { DemoCall } from "@/lib/handlers/demo";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

const call = (n: number, overrides: Partial<DemoCall> = {}): DemoCall => ({
  id: `call-${n}`,
  caller_name: `Caller ${n}`,
  phone: "+15550100123",
  reason: `Reason ${n}`,
  requested_time: "2026-11-10T14:00:00.000Z",
  received_at: "2026-11-03T12:00:00.000Z",
  ...overrides,
});

describe("FlowDemo", () => {
  const out = html(<FlowDemo />);

  it("offers the four ways to send a call", () => {
    for (const label of ["New call", "Send a duplicate", "Send a bad payload", "Forge a signature"]) expect(out).toContain(label);
    expect(out.match(/class="action( primary)?"/g)).toHaveLength(4);
  });

  it("shows the three steps and the four gates before anything is sent", () => {
    for (const text of ["Send a call", "The server checks it", "What is stored", "Signed?", "Valid?", "Seen before?", "Stored"]) expect(out).toContain(text);
    expect(out.match(/class="stage idle"/g)).toHaveLength(4);
  });

  it("says the data is made up", () => {
    expect(out).toContain("All names and numbers are made up");
  });

  it("has no dashboard in it", () => {
    expect(out).not.toMatch(/heatmap|Live activity|Calls over time|access key/i);
  });
});

describe("Pipeline", () => {
  it("marks each gate with what happened to the request", () => {
    const out = html(<Pipeline stages={describeFlow({ status: 200, body: { matched_on: "slot" } })} />);
    expect(out).toContain('class="stage pass"');
    expect(out).toContain('class="stage caught"');
    expect(out).toContain('class="stage skipped"');
  });

  it("reads out the state to screen readers, not only by colour", () => {
    const out = html(<Pipeline stages={describeFlow({ status: 401, body: {} })} />);
    expect(out).toContain("stopped here");
    expect(out).toContain("not reached");
  });

  it("numbers the gates until they have run", () => {
    const out = html(<Pipeline stages={describeFlow(null)} />);
    expect(out).toMatch(/aria-hidden="true">1</);
    expect(out).toMatch(/aria-hidden="true">4</);
  });
});

describe("ExchangePanels", () => {
  const exchange = { signature: "sha256=abc", body: '{"caller_name":"Jane"}', status: 201, answer: { status: "created", id: "1" } };

  it("asks for a click before there is anything to show", () => {
    expect(html(<ExchangePanels exchange={null} />)).toContain("Press a button");
  });

  it("shows the request that was sent, header and body", () => {
    const out = html(<ExchangePanels exchange={exchange} />);
    expect(out).toContain("POST /api/webhooks/call-summary");
    expect(out).toContain("X-Webhook-Signature: sha256=abc");
    expect(out).toContain("&quot;caller_name&quot;: &quot;Jane&quot;");
  });

  it("shows the answer with its status", () => {
    const out = html(<ExchangePanels exchange={exchange} />);
    expect(out).toContain('class="status ok">201');
    expect(out).toContain("&quot;status&quot;: &quot;created&quot;");
  });

  it("colours client errors and server errors differently", () => {
    expect(html(<ExchangePanels exchange={{ ...exchange, status: 422 }} />)).toContain('class="status warn"');
    expect(html(<ExchangePanels exchange={{ ...exchange, status: 500 }} />)).toContain('class="status bad"');
  });

  it("shows caller text as text, never as markup", () => {
    const hostile = { ...exchange, body: '{"caller_name":"<img src=x onerror=alert(1)>"}' };
    const out = html(<ExchangePanels exchange={hostile} />);
    expect(out).not.toContain("<img");
  });
});

describe("StoredCalls", () => {
  const render = (calls: DemoCall[], total = calls.length) => html(<StoredCalls total={total} calls={calls} onClear={() => {}} timeZone="America/New_York" />);

  it("says when nothing is stored", () => {
    expect(render([])).toContain("Nothing stored yet.");
    expect(render([])).not.toContain("<table");
  });

  it("lists the four fields of each call, and when it arrived", () => {
    const out = render([call(1)]);
    for (const text of ["Caller 1", "+15550100123", "Reason 1", "Tue, Nov 10, 9:00 AM", "Tue, Nov 3, 7:00 AM"]) expect(out).toContain(text);
  });

  it("shows caller text as text, never as markup", () => {
    const out = render([call(1, { caller_name: "<img src=x onerror=alert(1)>", reason: "<script>alert(1)</script>" })]);
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("says how many are stored, and when the list is cut short", () => {
    expect(render([call(1), call(2)])).toContain("2 stored");
    expect(render([call(1), call(2)], 40)).toContain("40 stored, showing the latest 2");
  });

  it("offers to clear them", () => {
    expect(render([call(1)])).toContain(">Clear<");
  });
});
