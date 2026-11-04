/* Architecture page: theme switch (shared with the dashboard) and "you are here" in the sidebar. No dependencies. */
(() => {
  "use strict";
  const THEME_STORE = "calldesk.theme";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const ICONS = {
    sun: "M8 10.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z M8 1.5v1.4 M8 13.1v1.4 M1.5 8h1.4 M13.1 8h1.4 M3.4 3.4l1 1 M11.6 11.6l1 1 M3.4 12.6l1-1 M11.6 4.4l1-1",
    moon: "M13.4 9.7A5.7 5.7 0 0 1 6.3 2.6a5.7 5.7 0 1 0 7.1 7.1z",
  };
  function icon(name) {
    const svg = document.createElementNS(SVG_NS, "svg");
    for (const [k, v] of Object.entries({ viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) svg.setAttribute(k, v);
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", ICONS[name]);
    svg.append(path);
    return svg;
  }

  const button = document.getElementById("theme");
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_STORE, theme); } catch { /* private mode: the choice just won't persist */ }
    button.replaceChildren(icon(theme === "dark" ? "sun" : "moon"));
  }
  let saved = null;
  try { saved = localStorage.getItem(THEME_STORE); } catch { /* ignore */ }
  setTheme(saved === "light" ? "light" : "dark");
  button.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

  // Highlight the sidebar entry for the section being read.
  const links = [...document.querySelectorAll('.nav-link[href^="#"]')];
  const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const a of links) a.classList.toggle("is-active", a === byId.get(entry.target.id));
    }
  }, { rootMargin: "-20% 0px -70% 0px" });
  for (const id of byId.keys()) { const el = document.getElementById(id); if (el) observer.observe(el); }
})();
