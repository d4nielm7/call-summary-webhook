"use client";

import { useState } from "react";
import type { DeliveryKind } from "@/lib/demo/simulator";
import { describeSimulation, type SimulationResponse } from "./format";

interface DemoControlsProps {
  dashboardKey: string | null;
  onResult: (result: { status?: number; text: string }) => void;
  onDone: () => void;
}

const ACTIONS: Array<{ kind: DeliveryKind; label: string; primary?: boolean }> = [
  { kind: "call", label: "New call", primary: true },
  { kind: "duplicate", label: "Send a duplicate" },
  { kind: "invalid", label: "Send a bad payload" },
  { kind: "unsigned", label: "Forge a signature" },
];

export function DemoControls({ dashboardKey, onResult, onDone }: DemoControlsProps) {
  const [busy, setBusy] = useState<DeliveryKind | null>(null);

  async function run(kind: DeliveryKind) {
    setBusy(kind);
    try {
      const response = await fetch(`/api/demo/simulate?kind=${kind}`, {
        method: "POST",
        headers: dashboardKey ? { authorization: `Bearer ${dashboardKey}` } : {},
      });
      const body = (await response.json()) as SimulationResponse;
      onResult({ status: body.status ?? response.status, text: describeSimulation(body) });
      onDone();
    } catch {
      onResult({ text: "Could not reach the server." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="demo">
      <span className="eyebrow">Play the receptionist</span>
      <div className="demo-buttons">
        {ACTIONS.map(({ kind, label, primary }) => (
          <button key={kind} className={primary ? "btn btn-primary" : "btn"} type="button" disabled={busy === kind} onClick={() => run(kind)}>
            {label}
          </button>
        ))}
      </div>
      <p className="muted small">Each button sends a fictional, signed webhook through the real endpoint.</p>
    </div>
  );
}
