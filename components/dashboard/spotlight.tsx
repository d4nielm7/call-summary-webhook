import type { ReactNode } from "react";
import { AnimatedNumber } from "./animated-number";

interface SpotlightProps {
  stored: number;
  days: number;
  children?: ReactNode;
}

export function Spotlight({ stored, days, children }: SpotlightProps) {
  return (
    <section className="card spotlight" id="overview" aria-label="Headline">
      <div className="orb" aria-hidden="true" />
      <div className="hero">
        <span className="eyebrow">Calls captured</span>
        <AnimatedNumber className="hero-figure" value={stored} />
        <p className="muted">stored in the last {days} days</p>
      </div>
      {children}
    </section>
  );
}
