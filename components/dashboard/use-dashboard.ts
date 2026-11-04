"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isRange, type DashboardResponse } from "@/lib/dashboard";

const KEY_STORE = "calldesk.key";
const RANGE_STORE = "calldesk.days";
const POLL_MS = 3000;
const DEFAULT_DAYS = 14;

export interface Snapshot {
  data: DashboardResponse;
  freshFeed: ReadonlySet<number>;
  freshCalls: ReadonlySet<string>;
}

export function withFresh(previous: Snapshot | null, data: DashboardResponse): Snapshot {
  if (!previous || previous.data.days !== data.days) {
    return { data, freshFeed: new Set(), freshCalls: new Set() };
  }
  const knownFeed = new Set(previous.data.feed.map((item) => item.id));
  const knownCalls = new Set(previous.data.calls.map((call) => call.id));
  return {
    data,
    freshFeed: new Set(data.feed.filter((item) => !knownFeed.has(item.id)).map((item) => item.id)),
    freshCalls: new Set(data.calls.filter((call) => !knownCalls.has(call.id)).map((call) => call.id)),
  };
}

function initialKey(): string | null {
  const fromHash = /[#&]key=([^&]+)/.exec(location.hash)?.[1];
  if (fromHash) {
    try {
      return decodeURIComponent(fromHash);
    } catch {
      return null;
    }
  }
  return sessionStorage.getItem(KEY_STORE);
}

function initialDays(): number {
  const saved = Number(localStorage.getItem(RANGE_STORE));
  return isRange(saved) ? saved : DEFAULT_DAYS;
}

export function useDashboard() {
  const [key, setKey] = useState(initialKey);
  const [days, setDaysState] = useState(initialDays);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [gate, setGate] = useState({ locked: false, message: "", attempt: 0 });
  const [connection, setConnection] = useState({ online: true, lastOk: 0 });
  const loadRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (location.hash.includes("key=")) history.replaceState(null, "", location.pathname + location.search);
  }, []);

  const lock = useCallback((message = "") => {
    sessionStorage.removeItem(KEY_STORE);
    setKey(null);
    setSnapshot(null);
    setGate((current) => ({ locked: true, message, attempt: current.attempt + 1 }));
  }, []);

  useEffect(() => {
    if (gate.locked) return;
    let active = true;
    let inFlight = false;

    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`/api/dashboard?days=${days}`, {
          headers: key ? { authorization: `Bearer ${key}` } : {},
          cache: "no-store",
        });
        if (!active) return;
        if (response.status === 401) return lock(key ? "That key was not accepted." : "");
        if (response.status === 404) return lock("This server has the dashboard switched off. Set DASHBOARD_TOKEN to turn it on.");
        if (!response.ok) throw new Error(String(response.status));

        const data = (await response.json()) as DashboardResponse;
        if (!active) return;
        if (key) sessionStorage.setItem(KEY_STORE, key);
        setSnapshot((previous) => withFresh(previous, data));
        setConnection({ online: true, lastOk: Date.now() });
      } catch {
        if (active) setConnection((current) => ({ ...current, online: false }));
      } finally {
        inFlight = false;
      }
    }

    loadRef.current = load;
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key, days, gate.locked, lock]);

  const setDays = useCallback((next: number) => {
    localStorage.setItem(RANGE_STORE, String(next));
    setDaysState(next);
  }, []);

  const signIn = useCallback((value: string) => {
    setGate((current) => ({ ...current, locked: false, message: "" }));
    setKey(value);
  }, []);

  const refresh = useCallback(() => loadRef.current(), []);

  return {
    key,
    days,
    setDays,
    snapshot,
    loading: snapshot !== null && snapshot.data.days !== days,
    gate,
    connection,
    signIn,
    lock,
    refresh,
  };
}
