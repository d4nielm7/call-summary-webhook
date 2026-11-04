import type { FlowResult } from "@/lib/flow";
import { prettyJson } from "./format";

export interface Exchange {
  signature: string;
  body: string;
  status: number;
  answer: FlowResult["body"];
}

const tone = (status: number) => (status < 300 ? "ok" : status < 500 ? "warn" : "bad");

export function ExchangePanels({ exchange }: { exchange: Exchange | null }) {
  if (!exchange) return <p className="muted">Press a button to see exactly what is sent and what comes back.</p>;

  return (
    <div className="exchange">
      <div className="panel">
        <h3>Sent</h3>
        <pre>
          {`POST /api/webhooks/call-summary\nX-Webhook-Signature: ${exchange.signature}\n\n${prettyJson(exchange.body)}`}
        </pre>
      </div>
      <div className="panel">
        <h3>
          Answered <span className={`status ${tone(exchange.status)}`}>{exchange.status}</span>
        </h3>
        <pre>{JSON.stringify(exchange.answer, null, 2)}</pre>
      </div>
    </div>
  );
}
