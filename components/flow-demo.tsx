"use client";

import { useEffect, useState } from "react";
import type { DeliveryKind } from "@/lib/demo/simulator";
import { describeFlow } from "@/lib/flow";
import { clearStored, loadStored, sendCall, type Outcome, type Stored } from "./demo-api";
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

export function FlowDemo() {
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [busy, setBusy] = useState<DeliveryKind | null>(null);
  const [stored, setStored] = useState<Stored | null>(null);
  const [off, setOff] = useState(false);
  const [broken, setBroken] = useState(false);
  const [reload, setReload] = useState(0);

  function note(outcome: Outcome<unknown>) {
    if (outcome.ok) return setBroken(false);
    if (outcome.reason === "off") return setOff(true);
    setBroken(true);
  }

  useEffect(() => {
    let active = true;

    async function load() {
      const outcome = await loadStored();
      if (!active) return;
      note(outcome);
      if (outcome.ok) setStored(outcome.value);
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
    const outcome = await sendCall(kind);
    setBusy(null);
    note(outcome);
    if (outcome.ok) {
      setExchange(outcome.value);
      setReload((n) => n + 1);
    }
  }

  async function clear() {
    note(await clearStored());
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

      {broken && (
        <p className="notice warn">
          The server answered with an error. Check the terminal where it is running. If you just changed the code, stop it and start it again.
        </p>
      )}

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
