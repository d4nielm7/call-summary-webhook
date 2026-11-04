"use client";

import { useEffect, useState } from "react";
import type { DeliveryKind } from "@/lib/demo/simulator";
import { describeFlow, type FlowResult } from "@/lib/flow";
import type { DemoCall } from "@/lib/handlers/demo";
import { ExchangePanels, type Exchange } from "./exchange";
import { Pipeline } from "./pipeline";
import { StoredCalls } from "./stored-calls";

const ACTIONS: Array<{ kind: DeliveryKind; label: string; hint: string; primary?: boolean }> = [
  { kind: "call", label: "New call", hint: "A made-up caller, signed correctly", primary: true },
  { kind: "duplicate", label: "Send a duplicate", hint: "The last stored call again" },
  { kind: "invalid", label: "Send a bad payload", hint: "One field is wrong" },
  { kind: "unsigned", label: "Forge a signature", hint: "Signed with the wrong secret" },
];

const POLL_MS = 3000;

interface SendResponse {
  request: { signature: string; body: string };
  response: { status: number; body: FlowResult["body"] };
}

export function FlowDemo() {
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [busy, setBusy] = useState<DeliveryKind | null>(null);
  const [stored, setStored] = useState<{ total: number; calls: DemoCall[] } | null>(null);
  const [off, setOff] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/demo/calls", { cache: "no-store" });
        if (!active) return;
        if (response.status === 404) return setOff(true);
        setStored(await response.json());
      } catch {
        // The next poll tries again.
      }
    }

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [reload]);

  async function send(kind: DeliveryKind) {
    setBusy(kind);
    try {
      const response = await fetch(`/api/demo/send?kind=${kind}`, { method: "POST" });
      if (response.status === 404) return setOff(true);
      const sent = (await response.json()) as SendResponse;
      setExchange({ ...sent.request, status: sent.response.status, answer: sent.response.body });
      setReload((n) => n + 1);
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    await fetch("/api/demo/calls", { method: "DELETE" });
    setReload((n) => n + 1);
  }

  const stages = describeFlow(exchange && { status: exchange.status, body: exchange.answer });

  return (
    <main className="page">
      <header>
        <h1>Call summary webhook</h1>
        <p className="muted">
          An AI receptionist hands over a call summary: caller name, phone, reason and requested time. The server checks it, drops
          duplicates and stores it. Press a button to play the receptionist. All names and numbers are made up.
        </p>
      </header>

      {off ? (
        <p className="notice">
          The demo is switched off on this server. Start it with <code>npm run demo</code>.
        </p>
      ) : (
        <>
          <section>
            <h2>
              <span className="n">1</span> Send a call
            </h2>
            <div className="actions">
              {ACTIONS.map(({ kind, label, hint, primary }) => (
                <button key={kind} className={primary ? "action primary" : "action"} type="button" disabled={busy !== null} onClick={() => send(kind)}>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2>
              <span className="n">2</span> The server checks it
            </h2>
            <Pipeline stages={stages} />
            <ExchangePanels exchange={exchange} />
          </section>

          <section>
            <h2>
              <span className="n">3</span> What is stored
            </h2>
            {stored ? <StoredCalls total={stored.total} calls={stored.calls} onClear={clear} /> : <p className="muted">Loading…</p>}
          </section>
        </>
      )}
    </main>
  );
}
