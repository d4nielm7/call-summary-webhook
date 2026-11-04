"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { AccessGate } from "./access-gate";
import { ActivityCard } from "./activity-card";
import { CallsCard } from "./calls-card";
import { DemoControls } from "./demo-controls";
import { HeatCard } from "./heat-card";
import { KpiTiles } from "./kpi-tiles";
import { OutcomesCard } from "./outcomes-card";
import { Rail } from "./rail";
import { Spotlight } from "./spotlight";
import { Toast, type ToastMessage } from "./toast";
import { TooltipProvider } from "./tooltip";
import { TopBar } from "./top-bar";
import { TrendCard } from "./trend-card";
import { useDashboard } from "./use-dashboard";
import { NowProvider } from "./use-now";

const subscribe = () => () => {};

function DashboardApp() {
  const { key, days, setDays, snapshot, loading, gate, connection, signIn, lock, refresh } = useDashboard();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  if (!snapshot) {
    return gate.locked ? <AccessGate key={gate.attempt} message={gate.message} onSubmit={signIn} /> : null;
  }

  const { data, freshFeed, freshCalls } = snapshot;

  return (
    <div className="app">
      <Rail demo={data.demo} onLock={key ? () => lock() : undefined} />
      <main className={`main${loading ? " is-loading" : ""}`}>
        <TopBar timeZone={data.time_zone} days={days} online={connection.online} lastOk={connection.lastOk} onDaysChange={setDays} />
        <Spotlight stored={data.totals.stored} days={data.days}>
          {data.demo && (
            <DemoControls dashboardKey={key} onResult={(result) => setToast({ id: Date.now(), ...result })} onDone={refresh} />
          )}
        </Spotlight>
        <KpiTiles data={data} />
        <div className="grid" id="insights">
          <TrendCard data={data} />
          <OutcomesCard data={data} />
          <HeatCard data={data} />
          <ActivityCard data={data} freshIds={freshFeed} />
          <CallsCard key={data.days} data={data} freshIds={freshCalls} />
        </div>
        {data.demo && <footer className="foot muted small">Every name and number here is fictional sample data.</footer>}
      </main>
      {toast && <Toast toast={toast} onDismiss={dismissToast} />}
    </div>
  );
}

export function Dashboard() {
  const isClient = useSyncExternalStore(subscribe, () => true, () => false);
  if (!isClient) return null;

  return (
    <NowProvider>
      <TooltipProvider>
        <DashboardApp />
      </TooltipProvider>
    </NowProvider>
  );
}
