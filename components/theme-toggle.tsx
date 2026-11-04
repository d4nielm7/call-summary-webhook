"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "./icons";

const STORAGE_KEY = "calldesk.theme";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const currentTheme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "dark");

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <button className="icon-btn" type="button" onClick={toggle} aria-label="Switch between dark and light theme" title="Theme">
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
