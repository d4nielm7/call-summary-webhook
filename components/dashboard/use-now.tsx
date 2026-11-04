"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const NowContext = createContext(0);

export function NowProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return <NowContext value={now}>{children}</NowContext>;
}

export const useNow = () => useContext(NowContext);
