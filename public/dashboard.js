/*
  Call Desk dashboard. Plain JavaScript, no build step, no dependencies.

  Rules this file keeps:
  - Everything that came from a caller (names, reasons) is put on the page with textContent / text nodes,
    never innerHTML. A caller who says their name is "<img onerror=...>" gets that text shown, nothing more.
  - Colour is never chosen here. Charts use CSS classes that read theme variables, so the theme switch
    repaints them without a redraw, and each outcome keeps its colour in every chart.
*/
(() => {
  "use strict";

  const KEY_STORE = "calldesk.key";
  const THEME_STORE = "calldesk.theme";
  const RANGE_STORE = "calldesk.days";
  const POLL_MS = 3000;
  const PAGE_SIZE = 12;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const nf = new Intl.NumberFormat("en-US");

  // ---------------------------------------------------------------- tiny DOM helpers

  function applyProps(node, props) {
    for (const [name, value] of Object.entries(props || {})) {
      if (value == null || value === false) continue;
      if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
      else node.setAttribute(name, value === true ? "" : String(value));
    }
  }
  function append(node, kids) {
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
  }
  const h = (tag, props, ...kids) => {
    const node = document.createElement(tag);
    applyProps(node, props);
    append(node, kids);
    return node;
  };
  const s = (tag, props, ...kids) => {
    const node = document.createElementNS(SVG_NS, tag);
    applyProps(node, props);
    append(node, kids);
    return node;
  };

  const ICONS = {
    check: "M3.5 8.5l3 3 6-6.5",
    copy: "M5.5 5.5h7v7h-7z M3.5 10.5v-7h7",
    alert: "M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M8 5v3.5 M8 10.8h.01",
    shield: "M8 2.2l4.6 1.8v3.6c0 2.7-2 4.6-4.6 5.9-2.6-1.3-4.6-3.2-4.6-5.9V4z",
    sun: "M8 10.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z M8 1.5v1.4 M8 13.1v1.4 M1.5 8h1.4 M13.1 8h1.4 M3.4 3.4l1 1 M11.6 11.6l1 1 M3.4 12.6l1-1 M11.6 4.4l1-1",
    moon: "M13.4 9.7A5.7 5.7 0 0 1 6.3 2.6a5.7 5.7 0 1 0 7.1 7.1z",
    lock: "M4.5 7.5h7v5.7h-7z M5.8 7.5V5.7a2.2 2.2 0 0 1 4.4 0v1.8",
  };
  const icon = (name) =>
    s("svg", { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" }, s("path", { d: ICONS[name] }));

  // Each outcome keeps one colour slot everywhere: tile, line, bar block, feed pill.
  const OUTCOMES = {
    created: { slot: "1", label: "Stored", short: "Stored", icon: "check" },
    duplicate: { slot: "2", label: "Duplicate blocked", short: "Duplicate", icon: "copy" },
    invalid: { slot: "3", label: "Rejected as invalid", short: "Rejected", icon: "alert" },
    unauthorized: { slot: "4", label: "Bad signature", short: "Bad signature", icon: "shield" },
  };

  // ---------------------------------------------------------------- state

  const state = {
    key: null,
    days: Number(localStorage.getItem(RANGE_STORE)) || 14,
    data: null,
    tz: "America/New_York",
    showPhones: false,
    query: "",
    limit: PAGE_SIZE,
    tableView: {},
    seenFeed: null,
    seenCalls: null,
    fetching: false,
    lastOk: 0,
  };
  if (![7, 14, 30].includes(state.days)) state.days = 14;

  // ---------------------------------------------------------------- time + number formatting

  const formatters = new Map();
  function dtf(name, options) {
    const key = `${name}|${state.tz}`;
    let f = formatters.get(key);
    if (!f) formatters.set(key, (f = new Intl.DateTimeFormat("en-US", { timeZone: state.tz, ...options })));
    return f;
  }
  const parts = (f, date) => Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]));

  function slotText(iso) {
    const p = parts(dtf("slot", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), new Date(iso));
    return `${p.weekday}, ${p.month} ${p.day} · ${p.hour}:${p.minute} ${p.dayPeriod}`;
  }
  function dayLabel(key, long) {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", ...(long ? { weekday: "short" } : {}) });
    return f.format(new Date(`${key}T00:00:00Z`));
  }
  function ago(iso) {
    const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
    if (secs < 5) return "just now";
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  }
  function phone(p, full) {
    const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p);
    if (m) return full ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : `+1 (•••) •••-${m[3]}`;
    return full ? p : p.slice(0, -4).replace(/\d/g, "•") + p.slice(-4);
  }
  const hourLabel = (hr) => `${hr % 12 === 0 ? 12 : hr % 12}${hr < 12 ? "a" : "p"}`;
  const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

  // ---------------------------------------------------------------- animated numbers (a short roll, with a glow while it changes)

  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const frames = new WeakMap();
  function roll(el, to) {
    const from = Number(el.dataset.value ?? 0);
    el.dataset.value = String(to);
    cancelAnimationFrame(frames.get(el));
    if (from === to || reduceMotion()) {
      el.textContent = nf.format(to);
      return;
    }
    el.classList.add("number-glow");
    clearTimeout(el._glow);
    el._glow = setTimeout(() => el.classList.remove("number-glow"), 1200);
    const began = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - began) / 700);
      el.textContent = nf.format(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
      if (t < 1) frames.set(el, requestAnimationFrame(step));
    };
    frames.set(el, requestAnimationFrame(step));
  }

  // ---------------------------------------------------------------- tooltip + toast

  const tip = $("#tip");
  /** rows: [{ value, label, key: { kind: "line"|"box", slot } }]. Values lead, labels follow. */
  function showTip(clientX, clientY, title, rows) {
    tip.replaceChildren(
      h("div", { class: "tip-title" }, title),
      ...rows.map((r) =>
        h("div", { class: "tip-row" },
          r.key ? h("span", { class: r.key.kind === "line" ? `key-line c${r.key.slot}` : `key-box bg${r.key.slot}` }) : null,
          h("span", { class: "tip-val" }, r.value),
          h("span", { class: "tip-label" }, r.label)),
      ),
    );
    tip.hidden = false;
    const box = tip.getBoundingClientRect();
    let x = clientX + 14;
    let y = clientY - box.height - 12;
    if (x + box.width > innerWidth - 8) x = clientX - box.width - 14;
    if (y < 8) y = clientY + 16;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${y}px`;
  }
  const hideTip = () => { tip.hidden = true; };

  let toastTimer;
  function toast(...kids) {
    const el = $("#toast");
    el.replaceChildren(...kids.map((k) => (k.nodeType ? k : document.createTextNode(k))));
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
  }

  // ---------------------------------------------------------------- charts

  function niceStep(raw) {
    const pow = 10 ** Math.floor(Math.log10(raw));
    const f = raw / pow;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
  }

  function tableEl(columns, rows) {
    return h("table", { class: "table" },
      h("thead", null, h("tr", null, ...columns.map((c) => h("th", { class: c.num ? "num" : "" }, c.label)))),
      h("tbody", null, ...rows.map((r) => h("tr", null, ...r.map((cell, i) => h("td", { class: columns[i].num ? "num" : "" }, cell))))));
  }

  // --- KPI tiles with sparklines

  const KPIS = [
    { id: "stored24", label: "Stored in the last 24 hours", slot: "1", series: "stored", value: (d) => d.totals.last_24h, note: (d) => `${nf.format(d.daily.at(-1).stored)} so far today` },
    { id: "duplicates", label: "Duplicates blocked", slot: "2", series: "duplicates", value: (d) => d.totals.duplicates, note: (d) => `${pct(d.totals.duplicates, d.totals.stored + d.totals.duplicates)}% of valid deliveries were retries` },
    { id: "invalid", label: "Rejected as invalid", slot: "3", series: "invalid", value: (d) => d.totals.invalid, note: () => "Failed validation, nothing stored" },
    { id: "unauthorized", label: "Bad signatures blocked", slot: "4", series: "unauthorized", value: (d) => d.totals.unauthorized, note: () => "Not signed with the shared secret" },
  ];

  function buildKpis() {
    $("#kpis").replaceChildren(
      ...KPIS.map((k) =>
        h("article", { class: "card kpi", id: `kpi-${k.id}` },
          h("div", { class: "kpi-label" }, h("span", { class: `kpi-key bg${k.slot}` }), k.label),
          h("div", { class: "kpi-value", "data-role": "value" }, "0"),
          h("div", { class: "kpi-note", "data-role": "note" }),
          h("div", { "data-role": "spark" }))),
    );
  }

  function sparkline(values, slot, width) {
    const W = Math.max(80, width), H = 38, pad = 6;
    const lo = Math.min(...values), hi = Math.max(...values);
    const x = (i) => pad + ((W - pad * 2) * i) / Math.max(1, values.length - 1);
    const y = (v) => (hi === lo ? H / 2 : H - pad - ((H - pad * 2) * (v - lo)) / (hi - lo));
    const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    return s("svg", { class: "spark", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Daily trend, latest ${values.at(-1)}` },
      s("polyline", { class: "spark-line", points }),
      s("circle", { class: `spark-dot d${slot}`, cx: x(values.length - 1).toFixed(1), cy: y(values.at(-1)).toFixed(1), r: 4 }));
  }

  function renderKpis() {
    const d = state.data;
    for (const k of KPIS) {
      const tile = $(`#kpi-${k.id}`);
      roll($('[data-role="value"]', tile), k.value(d));
      $('[data-role="note"]', tile).textContent = k.note(d);
      const spark = $('[data-role="spark"]', tile);
      spark.replaceChildren(sparkline(d.daily.map((day) => day[k.series]), k.slot, spark.clientWidth || tile.clientWidth - 40));
    }
  }

  // --- Calls over time (area + line, crosshair tooltip)

  function renderTrend() {
    const d = state.data;
    const box = $("#trend-viz");
    const W = Math.max(320, box.clientWidth), H = 236;
    const wide = W >= 560; // direct labels need room on the right; narrow screens rely on the legend + tooltip
    const m = { t: 18, r: wide ? 100 : 14, b: 30, l: 36 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const n = d.daily.length;
    const peak = Math.max(1, ...d.daily.map((x) => Math.max(x.stored, x.duplicates)));
    const step = Math.max(1, niceStep(peak / 4));
    const ymax = step * 4;
    const x = (i) => m.l + (n === 1 ? iw / 2 : (iw * i) / (n - 1));
    const y = (v) => m.t + ih - (ih * v) / ymax;

    const path = (key) => d.daily.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
    const labelEvery = Math.ceil(n / 7);

    const svg = s("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Calls stored and duplicates blocked per day over the last ${n} days. Use the table view for the numbers.` });
    for (let t = 0; t <= 4; t++) {
      const v = step * t;
      svg.append(
        s("line", { class: t === 0 ? "axis-line" : "grid-line", x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }),
        s("text", { class: "tick tick-y", x: m.l - 8, y: y(v) + 4 }, nf.format(v)));
    }
    d.daily.forEach((p, i) => {
      if ((n - 1 - i) % labelEvery === 0) svg.append(s("text", { class: "tick tick-x", x: x(i), y: H - 8 }, dayLabel(p.date)));
    });
    svg.append(
      s("path", { class: "area", d: `${path("stored")}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` }),
      s("path", { class: "line l2", d: path("duplicates") }),
      s("path", { class: "line l1", d: path("stored") }));

    // End dots, with direct labels to their right on wide charts. Two labels that would touch are nudged
    // apart symmetrically so each stays beside its own dot.
    const last = d.daily[n - 1];
    const ends = [["stored", "d1", "Stored"], ["duplicates", "d2", "Duplicates"]].map(([key, cls, text]) => ({ key, cls, text, y: y(last[key]) }));
    const labelY = Object.fromEntries(ends.map((e) => [e.key, e.y]));
    if (wide && Math.abs(ends[0].y - ends[1].y) < 15) {
      const mid = (ends[0].y + ends[1].y) / 2;
      const [upper, lower] = ends[0].y <= ends[1].y ? [ends[0], ends[1]] : [ends[1], ends[0]];
      labelY[upper.key] = mid - 7.5;
      labelY[lower.key] = mid + 7.5;
    }
    for (const e of ends) {
      svg.append(s("circle", { class: `dot ${e.cls}`, cx: x(n - 1), cy: e.y, r: 4.5 }));
      if (wide) svg.append(s("text", { class: "end-label", x: x(n - 1) + 12, y: labelY[e.key] + 4 }, `${e.text} ${nf.format(last[e.key])}`));
    }

    // Hover / keyboard layer: a crosshair that snaps to the nearest day.
    const cross = s("g", { visibility: "hidden" }, s("line", { class: "cross", y1: m.t, y2: m.t + ih }),
      s("circle", { class: "dot d1", r: 4.5 }), s("circle", { class: "dot d2", r: 4.5 }));
    const hit = s("rect", { class: "hit", x: m.l, y: m.t, width: iw, height: ih, tabindex: "0", role: "group", "aria-label": "Chart readout. Use the left and right arrow keys to move between days." });
    svg.append(cross, hit);

    function show(i, clientX, clientY) {
      const p = d.daily[i];
      const [line, dotStored, dotDup] = cross.children;
      line.setAttribute("x1", x(i)); line.setAttribute("x2", x(i));
      dotStored.setAttribute("cx", x(i)); dotStored.setAttribute("cy", y(p.stored));
      dotDup.setAttribute("cx", x(i)); dotDup.setAttribute("cy", y(p.duplicates));
      cross.setAttribute("visibility", "visible");
      showTip(clientX, clientY, dayLabel(p.date, true), [
        { value: nf.format(p.stored), label: "Stored", key: { kind: "line", slot: "1" } },
        { value: nf.format(p.duplicates), label: "Duplicates blocked", key: { kind: "line", slot: "2" } },
      ]);
    }
    const hide = () => { cross.setAttribute("visibility", "hidden"); hideTip(); };
    const indexAt = (clientX) => {
      const r = svg.getBoundingClientRect();
      const px = ((clientX - r.left) * W) / r.width;
      return Math.min(n - 1, Math.max(0, Math.round(((px - m.l) / iw) * (n - 1))));
    };
    hit.addEventListener("pointermove", (e) => show(indexAt(e.clientX), e.clientX, e.clientY));
    hit.addEventListener("pointerleave", hide);
    hit.addEventListener("blur", hide);
    let focusIndex = n - 1;
    const showAtFocus = () => {
      const r = svg.getBoundingClientRect();
      show(focusIndex, r.left + (x(focusIndex) * r.width) / W, r.top + (m.t * r.height) / H);
    };
    hit.addEventListener("focus", showAtFocus);
    hit.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      focusIndex = Math.min(n - 1, Math.max(0, focusIndex + (e.key === "ArrowRight" ? 1 : -1)));
      showAtFocus();
    });

    box.replaceChildren(svg);
    $("#trend-sub").textContent = `Per day · ${d.totals.stored} stored, ${d.totals.duplicates} duplicates blocked · days in ${state.tz.replace("_", " ")}`;
    $("#trend-legend").replaceChildren(
      h("li", null, h("span", { class: "key-line c1" }), "Stored"),
      h("li", null, h("span", { class: "key-line c2" }), "Duplicates blocked"));
    $("#trend-table").replaceChildren(tableEl(
      [{ label: "Day" }, { label: "Stored", num: true }, { label: "Duplicates", num: true }, { label: "Invalid", num: true }, { label: "Bad signature", num: true }],
      d.daily.map((p) => [dayLabel(p.date, true), nf.format(p.stored), nf.format(p.duplicates), nf.format(p.invalid), nf.format(p.unauthorized)])));
  }

  // --- Where deliveries ended up (tall segmented bar)

  function renderOutcomes() {
    const t = state.data.totals;
    const keys = ["created", "duplicate", "invalid", "unauthorized"];
    const counts = { created: t.stored, duplicate: t.duplicates, invalid: t.invalid, unauthorized: t.unauthorized };
    const total = keys.reduce((sum, k) => sum + counts[k], 0);
    const box = $("#outcomes-viz");

    if (!total) {
      box.replaceChildren(h("p", { class: "empty" }, "No deliveries in this range yet."));
    } else {
      const bar = h("div", { class: "segbar", role: "img", "aria-label": keys.map((k) => `${OUTCOMES[k].label} ${counts[k]}`).join(", ") });
      const labels = [];
      for (const k of keys.filter((key) => counts[key] > 0)) {
        const o = OUTCOMES[k];
        const seg = h("div", { class: `seg bg${o.slot}`, tabindex: "0", "aria-label": `${o.label}: ${counts[k]} (${pct(counts[k], total)}%)` });
        seg.style.flexGrow = String(counts[k]);
        seg.style.flexBasis = "0";
        const label = h("span");
        seg.append(label);
        labels.push([seg, label, `${pct(counts[k], total)}%`]);
        const open = (e) => {
          const r = seg.getBoundingClientRect();
          showTip(e.clientX ?? r.left + r.width / 2, e.clientY ?? r.top, o.label, [{ value: nf.format(counts[k]), label: `${pct(counts[k], total)}% of deliveries`, key: { kind: "box", slot: o.slot } }]);
        };
        seg.addEventListener("pointermove", open);
        seg.addEventListener("focus", open);
        seg.addEventListener("pointerleave", hideTip);
        seg.addEventListener("blur", hideTip);
        bar.append(seg);
      }
      const legend = h("ul", { class: "legend" }, ...keys.map((k) => h("li", null, h("span", { class: `key-box bg${OUTCOMES[k].slot}` }), OUTCOMES[k].label)));
      const absorbed = pct(t.duplicates, t.stored + t.duplicates);
      box.replaceChildren(bar, legend,
        h("p", { class: "callout" }, h("strong", null, `${nf.format(t.duplicates)} retries`), ` were absorbed instead of stored twice (${absorbed}% of valid deliveries). `,
          h("strong", null, nf.format(t.invalid + t.unauthorized)), " more were refused outright."));
      // A label goes inside its block only if it fits with padding; otherwise the tooltip and table carry it.
      requestAnimationFrame(() => {
        for (const [seg, label, text] of labels) label.textContent = seg.getBoundingClientRect().width >= 58 ? text : "";
      });
    }

    $("#outcomes-table").replaceChildren(tableEl(
      [{ label: "Outcome" }, { label: "Deliveries", num: true }, { label: "Share", num: true }],
      keys.map((k) => [OUTCOMES[k].label, nf.format(counts[k]), `${pct(counts[k], total)}%`])));
  }

  // --- When callers want to come in (weekday x hour heatmap)

  function renderHeat() {
    const d = state.data;
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const f = dtf("heat", { weekday: "short", hour: "2-digit", hourCycle: "h23" });
    const counts = days.map(() => Array(24).fill(0));
    for (const iso of d.requested_times) {
      const p = parts(f, new Date(iso));
      counts[days.indexOf(p.weekday)][Number(p.hour) % 24]++;
    }
    const flat = counts.flat();
    const max = Math.max(0, ...flat);
    const box = $("#heat-viz");

    if (!max) {
      box.replaceChildren(h("p", { class: "empty" }, "No appointment requests in this range yet."));
      $("#heat-sub").textContent = "Requested appointment times";
      $("#heat-table").replaceChildren();
      return;
    }

    const used = counts.flatMap((row) => row.map((v, hr) => (v ? hr : -1))).filter((hr) => hr >= 0);
    const lo = Math.min(8, ...used), hi = Math.max(17, ...used);
    const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    const level = (v) => (v === 0 ? 0 : Math.min(5, Math.ceil((v / max) * 5)));

    const grid = h("div", { class: "heat", role: "img", "aria-label": "Heatmap of requested appointment times by weekday and hour. Use the table view for the numbers." });
    const header = h("div", { class: "heat-row" }, h("span"), ...hours.map((hr) => h("span", { class: "heat-hour" }, hourLabel(hr))));
    header.style.setProperty("--cols", String(hours.length));
    grid.append(header);
    days.forEach((day, di) => {
      const row = h("div", { class: "heat-row" }, h("span", { class: "heat-day" }, day));
      row.style.setProperty("--cols", String(hours.length));
      for (const hr of hours) {
        const v = counts[di][hr];
        const cell = h("span", { class: "heat-cell", "data-level": level(v) });
        const open = (e) => showTip(e.clientX, e.clientY, `${day} ${hourLabel(hr)}–${hourLabel(hr + 1)}`, [{ value: nf.format(v), label: v === 1 ? "request" : "requests" }]);
        cell.addEventListener("pointermove", open);
        cell.addEventListener("pointerleave", hideTip);
        row.append(cell);
      }
      grid.append(row);
    });
    const scale = h("div", { class: "heat-scale" }, "Fewer", h("i"), h("i"), h("i"), h("i"), h("i"), h("i"), "More");
    box.replaceChildren(grid, scale);

    let best = { v: 0, di: 0, hr: 0 };
    counts.forEach((row, di) => row.forEach((v, hr) => { if (v > best.v) best = { v, di, hr }; }));
    $("#heat-sub").textContent = `${nf.format(d.requested_times.length)} requests · busiest ${days[best.di]} ${hourLabel(best.hr)} (${best.v}) · ${state.tz.replace("_", " ")}`;
    $("#heat-table").replaceChildren(tableEl(
      [{ label: "Hour" }, ...days.map((day) => ({ label: day, num: true }))],
      hours.map((hr) => [`${hourLabel(hr)}–${hourLabel(hr + 1)}`, ...days.map((_, di) => nf.format(counts[di][hr]))])));
  }

  // ---------------------------------------------------------------- feed + table

  function feedText(e) {
    switch (e.outcome) {
      case "created": return [e.caller_name, `${slotText(e.requested_time)} · ${e.reason}`];
      case "duplicate": return [e.caller_name, `Matched on ${e.matched_on === "call_id" ? "call id" : "phone + time"}`];
      case "invalid": return ["Invalid payload", "Failed validation · nothing was stored"];
      default: return ["Request refused", "Not signed with the shared secret"];
    }
  }

  function renderFeed() {
    const d = state.data;
    const fresh = state.seenFeed ? d.feed.filter((e) => !state.seenFeed.has(e.id)) : [];
    state.seenFeed = new Set(d.feed.map((e) => e.id));
    const freshIds = new Set(fresh.map((e) => e.id));
    $("#feed").replaceChildren(...(d.feed.length ? d.feed : []).map((e) => {
      const o = OUTCOMES[e.outcome];
      const [title, sub] = feedText(e);
      return h("li", { class: `feed-row${freshIds.has(e.id) ? " is-new" : ""}` },
        h("span", { class: `pill t${o.slot}` }, icon(o.icon), o.short),
        h("div", { class: "feed-main" }, h("div", { class: "feed-title" }, title), h("div", { class: "feed-sub" }, sub)),
        h("span", { class: "feed-time", "data-time": e.at }, ago(e.at)));
    }));
    if (!d.feed.length) $("#feed").replaceChildren(h("li", { class: "empty" }, "Nothing has arrived yet."));
  }

  function renderTable() {
    const d = state.data;
    const q = state.query.trim().toLowerCase();
    const rows = q ? d.calls.filter((c) => c.caller_name.toLowerCase().includes(q) || c.reason.toLowerCase().includes(q)) : d.calls;
    const fresh = state.seenCalls ? new Set(d.calls.filter((c) => !state.seenCalls.has(c.id)).map((c) => c.id)) : new Set();
    state.seenCalls = new Set(d.calls.map((c) => c.id));

    $("#calls-sub").textContent = q
      ? `${rows.length} of ${d.calls.length} calls match`
      : `${nf.format(d.totals.stored)} stored in the last ${d.days} days${d.totals.stored > d.calls.length ? ` · showing the latest ${d.calls.length}` : ""}`;

    const shown = rows.slice(0, state.limit);
    const table = $("#calls-table");
    table.replaceChildren(
      h("thead", null, h("tr", null, ...["Caller", "Phone", "Reason", "Wants to come in", "Received"].map((label) => h("th", null, label)))),
      h("tbody", null, ...(shown.length
        ? shown.map((c) => h("tr", { class: fresh.has(c.id) ? "is-new" : "" },
            h("td", { class: "who" }, c.caller_name),
            h("td", { class: "num", "data-label": "Phone" }, phone(c.phone, state.showPhones)),
            h("td", { class: "reason", "data-label": "Reason" }, c.reason),
            h("td", { class: "time", "data-label": "Wants" }, slotText(c.requested_time)),
            h("td", { class: "time", "data-label": "Received", "data-time": c.received_at, title: new Date(c.received_at).toLocaleString() }, ago(c.received_at))))
        : [h("tr", null, h("td", { colspan: "5", class: "empty" }, q ? "No calls match that search." : "No calls in this range yet.")) ])));
    const more = $("#more");
    more.hidden = rows.length <= state.limit;
    more.textContent = `Show ${Math.min(PAGE_SIZE, rows.length - state.limit)} more`;
  }

  // ---------------------------------------------------------------- orchestration

  function applyTableViews() {
    for (const name of ["trend", "outcomes", "heat"]) {
      const on = Boolean(state.tableView[name]);
      $(`#${name}-viz`).hidden = on;
      $(`#${name}-table`).hidden = !on;
      if (name === "trend") $("#trend-legend").hidden = on;
      const button = $(`[data-table-toggle="${name}"]`);
      button.setAttribute("aria-pressed", String(on));
      button.textContent = on ? "View as chart" : "View as table";
    }
  }

  function renderCharts() {
    if (!state.data) return;
    renderKpis();
    renderTrend();
    renderOutcomes();
    renderHeat();
    applyTableViews();
  }

  function render() {
    const d = state.data;
    state.tz = d.time_zone;
    $("#tz-note").textContent = `Calls the AI receptionist has handed over · clinic time, ${state.tz.replace("_", " ")}`;
    roll($("#hero-value"), d.totals.stored);
    $("#hero-caption").textContent = `stored in the last ${d.days} days`;
    $("#demo").hidden = !d.demo;
    renderCharts();
    renderFeed();
    renderTable();
    $$("#range button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.days) === d.days)));
  }

  function setLive(ok) {
    const live = $("#live");
    live.classList.toggle("is-live", ok);
    live.classList.toggle("is-off", !ok);
    if (ok) state.lastOk = Date.now();
    tickLive();
  }
  function tickLive() {
    const live = $("#live");
    if (live.classList.contains("is-off")) $("#live-text").textContent = "Offline · retrying";
    else if (state.lastOk) $("#live-text").textContent = `Live · updated ${ago(new Date(state.lastOk).toISOString())}`;
  }

  const authHeaders = () => ({ authorization: `Bearer ${state.key}` });

  async function refresh({ quiet = true } = {}) {
    if (!state.key || state.fetching) return;
    state.fetching = true;
    if (!quiet) $("#main").classList.add("is-loading"); // hold the previous render, dimmed: no skeleton, no jump
    try {
      const res = await fetch(`/api/dashboard?days=${state.days}`, { headers: authHeaders(), cache: "no-store" });
      if (res.status === 401) return showGate("That key was not accepted.");
      if (res.status === 404) return showGate("This server has the dashboard switched off. Set DASHBOARD_TOKEN to turn it on.");
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (data.days !== state.days) return; // the range changed while this was in flight
      state.data = data;
      sessionStorage.setItem(KEY_STORE, state.key);
      showApp();
      render();
      setLive(true);
    } catch {
      setLive(false);
    } finally {
      state.fetching = false;
      $("#main").classList.remove("is-loading");
    }
  }

  function showApp() {
    $("#gate").hidden = true;
    $("#app").hidden = false;
  }
  function showGate(message) {
    sessionStorage.removeItem(KEY_STORE);
    state.key = null;
    state.data = null;
    state.seenFeed = null;
    state.seenCalls = null;
    $("#app").hidden = true;
    $("#gate").hidden = false;
    const error = $("#gate-error");
    error.hidden = !message;
    error.textContent = message || "";
    $("#gate-key").value = "";
    $("#gate-key").focus();
  }

  async function simulate(kind, button) {
    button.disabled = true;
    try {
      const res = await fetch(`/api/demo/simulate?kind=${kind}`, { method: "POST", headers: authHeaders() });
      const out = await res.json();
      const r = out.result || {};
      const http = h("strong", null, `HTTP ${out.status ?? res.status}`);
      if (out.kind === "call") toast(http, " · new call stored");
      else if (out.kind === "duplicate") toast(http, ` · duplicate caught, matched on ${r.matched_on === "call_id" ? "call id" : "phone + time"}; nothing new stored`);
      else if (out.kind === "invalid") toast(http, ` · rejected: ${(r.errors || []).map((e) => e.field).join(", ")} failed validation`);
      else toast(http, " · refused: the signature didn't match");
      await refresh();
    } catch {
      toast("Could not reach the server.");
    } finally {
      button.disabled = false;
    }
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORE, theme);
    $("#theme").replaceChildren(icon(theme === "dark" ? "sun" : "moon"));
  }

  function boot() {
    setTheme(localStorage.getItem(THEME_STORE) === "light" ? "light" : "dark");
    $("#lock").append(icon("lock"));
    buildKpis();

    // The key may arrive in the URL fragment (never sent to the server); take it and tidy the address bar.
    const fromHash = /[#&]key=([^&]+)/.exec(location.hash)?.[1];
    if (fromHash) history.replaceState(null, "", location.pathname + location.search);
    state.key = (fromHash && decodeURIComponent(fromHash)) || sessionStorage.getItem(KEY_STORE);

    $("#gate-form").addEventListener("submit", (e) => {
      e.preventDefault();
      state.key = $("#gate-key").value.trim();
      if (state.key) refresh({ quiet: false });
    });
    $("#lock").addEventListener("click", () => showGate(""));
    $("#theme").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
    $("#range").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-days]");
      if (!b || Number(b.dataset.days) === state.days) return;
      state.days = Number(b.dataset.days);
      localStorage.setItem(RANGE_STORE, String(state.days));
      state.limit = PAGE_SIZE;
      $$("#range button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      refresh({ quiet: false });
    });
    $$("[data-table-toggle]").forEach((b) => b.addEventListener("click", () => {
      const name = b.dataset.tableToggle;
      state.tableView[name] = !state.tableView[name];
      applyTableViews();
    }));
    $("#search").addEventListener("input", (e) => { state.query = e.target.value; state.limit = PAGE_SIZE; if (state.data) renderTable(); });
    $("#show-phones").addEventListener("change", (e) => { state.showPhones = e.target.checked; if (state.data) renderTable(); });
    $("#more").addEventListener("click", () => { state.limit += PAGE_SIZE; renderTable(); });
    $("#demo").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-kind]");
      if (b) simulate(b.dataset.kind, b);
    });
    $$("#range button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.days) === state.days)));
    $$(".nav-link").forEach((a) => a.addEventListener("click", () => {
      $$(".nav-link").forEach((x) => x.classList.toggle("is-active", x === a));
    }));

    // Re-draw width-dependent charts when the layout changes; keep relative times fresh.
    let width = 0, queued = 0;
    new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w === width) return;
      width = w;
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(renderCharts);
    }).observe($("#main"));
    setInterval(() => {
      for (const el of $$("[data-time]")) el.textContent = ago(el.dataset.time);
      tickLive();
    }, 1000);
    setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

    if (state.key) refresh({ quiet: false });
    else showGate("");
  }

  boot();
})();
