import type { ReactNode } from "react";

export const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "system", label: "In detail" },
  { id: "path", label: "Request path" },
  { id: "data", label: "Data" },
  { id: "flow", label: "Dashboard data" },
  { id: "security", label: "Security" },
  { id: "decisions", label: "Decisions" },
];

export const FACTS = [
  { value: "1", label: "Next.js project" },
  { value: "1", label: "SQLite file" },
  { value: "4", label: "runtime dependencies" },
  { value: "0", label: "outside services" },
  { value: "350+", label: "automated tests" },
];

export function Badge({ tone, children }: { tone?: "key" | "uq"; children: ReactNode }) {
  return <span className={tone ? `badge ${tone}` : "badge"}>{children}</span>;
}

interface Column {
  name: string;
  type: string;
  detail: ReactNode;
}

export const TABLES: Array<{ name: string; badge: string; columns: Column[]; note?: string }> = [
  {
    name: "calls",
    badge: "one row per real call",
    columns: [
      { name: "id", type: "TEXT", detail: <Badge tone="key">PRIMARY KEY</Badge> },
      { name: "call_id", type: "TEXT, nullable", detail: <><Badge tone="uq">UNIQUE</Badge> the sender&apos;s id</> },
      { name: "fingerprint", type: "TEXT", detail: <><Badge tone="uq">UNIQUE</Badge> phone + slot</> },
      { name: "caller_name", type: "TEXT", detail: "whitespace collapsed" },
      { name: "phone", type: "TEXT", detail: "E.164" },
      { name: "reason", type: "TEXT", detail: "up to 1,000 chars" },
      { name: "requested_time", type: "TEXT", detail: "UTC, ISO 8601" },
      { name: "received_at", type: "TEXT", detail: "UTC" },
    ],
  },
  {
    name: "events",
    badge: "one row per delivery attempt",
    columns: [
      { name: "id", type: "INTEGER", detail: <Badge tone="key">PRIMARY KEY</Badge> },
      { name: "at", type: "TEXT", detail: "UTC, indexed" },
      { name: "outcome", type: "TEXT", detail: "created, duplicate, invalid, unauthorized" },
      { name: "call_ref", type: "TEXT, nullable", detail: "points at calls.id" },
      { name: "matched_on", type: "TEXT, nullable", detail: "call_id or slot" },
    ],
    note: "It holds no caller data, which is what lets the dashboard count refused and repeated deliveries without storing personal data twice. Rows older than the latest 20,000 are pruned on insert, so a flood of bad requests cannot grow the file without limit.",
  },
];

export const CONTROLS = [
  {
    title: "Who may send a call",
    body: "The sender signs the raw body with a shared secret. The server recomputes the signature and compares in constant time, before it parses anything.",
    proofLabel: "test",
    proof: "401s a missing, wrong or mismatched signature and stores nothing",
  },
  {
    title: "What may be stored",
    body: "Every field is cleaned and checked. Errors name the field but never repeat the value, so personal data is not echoed back or logged.",
    proofLabel: "test",
    proof: "does not echo caller data back in the error response",
  },
  {
    title: "Two calls at once",
    body: "The database's unique keys decide, in the same statement that writes. There is no gap between checking and saving for a second call to slip through.",
    proofLabel: "test",
    proof: "stores only one of many simultaneous identical deliveries",
  },
  {
    title: "Who may read the dashboard",
    body: "The page and its files hold no data. The data endpoint needs a bearer token, hashed and compared in constant time. With no token configured it answers 404. Demo mode, where every record is made up, skips the token.",
    proofLabel: "test",
    proof: "401s a wrong token before touching the database",
  },
  {
    title: "What the browser may run",
    body: "React escapes caller text, so it is only ever shown as text. A nonce-based Content-Security-Policy, set per request in proxy.ts, blocks inline scripts and framing.",
    proofLabel: "tests",
    proof: "shows caller text as text, never as markup · allows scripts only from this origin and the nonce",
  },
  {
    title: "How big a request may be",
    body: "The body is read as a stream and cut off at 64 KB, whatever the sender claims about its length, so an oversized request is never buffered.",
    proofLabel: "test",
    proof: "stops reading a stream that exceeds the limit even with no content-length",
  },
  {
    title: "The demo controls",
    body: "The route that makes up fake calls exists only when demo mode is on. On a real server it answers 404, even with a valid token.",
    proofLabel: "test",
    proof: "does not exist unless demo mode is on",
  },
  {
    title: "What the logs hold",
    body: "One line per request with the outcome, an id and the names of failed fields. Never a name, a number or a reason.",
    proofLabel: "test",
    proof: "never logs caller data",
  },
];

export const DECISIONS: Array<{ decision: string; why: string; cost: ReactNode }> = [
  {
    decision: "SQLite in one file",
    why: "Real storage that can enforce uniqueness, with nothing to install. A reviewer runs it in one command.",
    cost: (
      <>
        Needs a persistent disk. On serverless hosting such as Vercel, swap <code>CallStore</code> for Postgres and keep the same two UNIQUE keys; nothing else changes.
      </>
    ),
  },
  {
    decision: "A duplicate answers 200",
    why: "Senders retry anything that is not a success. An error would make them retry again.",
    cost: "The status alone cannot tell the sender it was a repeat. The body says so, with the original id.",
  },
  {
    decision: "Duplicate key is call id, or phone plus slot",
    why: "Names and summaries change between calls; a phone number and a requested time do not.",
    cost: "Two people calling from one number for the same slot become one record. The reply names the original, so nothing fails silently.",
  },
  {
    decision: "Requested time must carry a timezone",
    why: "\"3pm\" has no meaning without one, and guessing in the server's timezone would store wrong appointments.",
    cost: "Sloppy senders get a 422 they cannot retry past. That is intended.",
  },
  {
    decision: "Next.js for the API, the dashboard and these docs",
    why: "One project, one deploy and the same tooling as the rest of the stack.",
    cost: "More framework than a single endpoint needs. The webhook logic lives in lib/ with no Next imports, so it can move to another server. Charts are plain SVG components with no chart library.",
  },
  {
    decision: "Numbers added up in JavaScript",
    why: "Simple and correct at appointment-inbox volume (thousands of rows).",
    cost: "At much larger volume, move the GROUP BY into SQL.",
  },
  {
    decision: "A separate events table",
    why: "Makes blocked and refused deliveries countable without storing personal data twice.",
    cost: "One extra write per delivery. A failure to log is caught and never fails the call.",
  },
];
