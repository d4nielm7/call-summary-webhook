"use client";

import { useEffect, useRef, useState } from "react";
import { formatNumber } from "./format";

const DURATION_MS = 700;

export function AnimatedNumber({ value, className }: { value: number; className: string }) {
  const [shown, setShown] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const from = latest.current;
    if (from === value) return;

    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : DURATION_MS;
    const began = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - began) / duration);
      latest.current = Math.round(from + (value - from) * (1 - (1 - t) ** 3));
      setShown(latest.current);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <div className={shown === value ? className : `${className} number-glow`}>{formatNumber(shown)}</div>;
}
