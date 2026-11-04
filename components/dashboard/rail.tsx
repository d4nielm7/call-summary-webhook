"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icons";
import { SectionNav } from "@/components/section-nav";
import { ThemeToggle } from "@/components/theme-toggle";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "insights", label: "Insights" },
  { id: "activity", label: "Live activity" },
  { id: "calls", label: "Calls" },
];

const WEBHOOK_PATH = "/api/webhooks/call-summary";

function WebhookSource({ demo }: { demo: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${WEBHOOK_PATH}`);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="endpoint" type="button" onClick={copy} title="Copy the webhook URL">
      <span className="eyebrow">{demo ? "Source · simulated" : "Source · POST"}</span>
      <code>{WEBHOOK_PATH}</code>
      <span className="endpoint-hint">{copied ? "URL copied" : "Click to copy the URL"}</span>
    </button>
  );
}

export function Rail({ demo, onLock }: { demo: boolean; onLock?: () => void }) {
  return (
    <aside className="rail">
      <div className="brand">
        <Brand />
      </div>
      <p className="rail-sub">AI receptionist inbox</p>
      <nav className="nav" aria-label="Sections">
        <SectionNav sections={SECTIONS} />
        <span className="nav-label">Docs</span>
        <Link href="/architecture" className="nav-link">
          Architecture
        </Link>
      </nav>
      <div className="rail-foot">
        <WebhookSource demo={demo} />
        <div className="rail-actions">
          <ThemeToggle />
          {onLock && (
            <button className="icon-btn" type="button" onClick={onLock} aria-label="Lock dashboard" title="Lock">
              <Icon name="lock" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
