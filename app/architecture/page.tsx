import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { SectionNav } from "@/components/section-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import "./architecture.css";
import { CONTROLS, DECISIONS, FACTS, SECTIONS, TABLES } from "./content";
import { DashboardFlowDiagram, OverviewDiagram, RequestPathDiagram, SystemDiagram } from "./diagrams";

export const metadata: Metadata = {
  title: "Architecture · Call Desk",
  robots: { index: false, follow: false },
};

function Head({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="head">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

function Figure({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <figure>
      <div className="fig">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export default function ArchitecturePage() {
  return (
    <div className="app">
      <aside className="rail">
        <Link className="brand" href="/" aria-label="Call Desk dashboard">
          <Brand />
        </Link>
        <p className="rail-sub">Architecture</p>
        <nav className="nav" aria-label="Sections">
          <Link href="/" className="nav-link">
            ← Back to dashboard
          </Link>
          <span className="nav-label">On this page</span>
          <SectionNav sections={SECTIONS} />
        </nav>
        <div className="rail-foot">
          <div className="rail-actions">
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <main className="main doc" id="main">
        <header className="top">
          <div>
            <h1>Architecture</h1>
            <p className="muted">How one small server receives, checks, de-duplicates and stores every call</p>
          </div>
        </header>

        <div className="facts" aria-label="Size of the system">
          {FACTS.map((fact) => (
            <div key={fact.label} className="card fact">
              <b>{fact.value}</b>
              <span>{fact.label}</span>
            </div>
          ))}
        </div>

        <section id="overview">
          <Head eyebrow="Overview" title="The whole system on one page">
            A receptionist sends in a call summary. The server checks it and stores it once. Staff watch it arrive on a dashboard.
          </Head>
          <Figure
            caption={
              <>
                <b>How to read it.</b> The blue path is what was asked for: a call comes in, is checked in four steps, and is stored once. The grey path is the dashboard, which only ever talks to the server and never touches the database directly. The simulator sends the same kind of call as the real receptionist, so the demo exercises the real checks.
              </>
            }
          >
            <OverviewDiagram />
          </Figure>
        </section>

        <section id="system">
          <Head eyebrow="1 · System in detail" title="The same system, down to the files">
            Everything runs in one process with one database file. The blue path is the brief: receive, validate, de-duplicate, store. The grey paths exist so the work can be seen and demonstrated.
          </Head>
          <Figure
            caption={
              <>
                <b>What the figure shows.</b> A receptionist (or the simulator) posts a signed call summary. It passes three modules, <code>signature.ts</code>, <code>schema.ts</code> and <code>store.ts</code>, and lands in one SQLite file. The dashboard is a React page plus one JSON endpoint that reads the same file. The demo route is a loop: it makes up a call and sends it through the real webhook pipeline, so nothing about the demo is faked.
              </>
            }
          >
            <SystemDiagram />
          </Figure>
        </section>

        <section id="path">
          <Head eyebrow="2 · Request path" title="Every call passes five gates, and the last step is a single statement">
            Each gate can end the request with its own status code. The order puts the cheapest and most security-relevant checks first, so an unsigned request costs almost nothing.
          </Head>
          <Figure
            caption={
              <>
                <b>Reading the outcomes.</b> Red answers are final: sending the same bytes again cannot help, so the sender should stop. A duplicate is a <b>200</b> and not an error, because webhook senders retry anything that is not a success. A storage failure returns <b>500</b>, which is the one answer that asks the sender to try again.
              </>
            }
          >
            <RequestPathDiagram />
          </Figure>
        </section>

        <section id="data">
          <Head eyebrow="3 · Data" title="The database enforces the duplicate rule, not the code around it">
            Two <code>UNIQUE</code> constraints decide what counts as a repeat, and one statement does the check and the write together. Two identical calls arriving at the same instant, even in two processes, can only produce one row.
          </Head>
          <div className="grid2">
            {TABLES.map((table) => (
              <div key={table.name} className="card">
                <h3>
                  {table.name} <span className="badge">{table.badge}</span>
                </h3>
                <div className="cols">
                  {table.columns.map((column) => (
                    <div key={column.name} className="r">
                      <span className="n">{column.name}</span>
                      <span className="t">{column.type}</span>
                      <span>{column.detail}</span>
                    </div>
                  ))}
                </div>
                {table.note && <p>{table.note}</p>}
              </div>
            ))}
          </div>
          <pre className="pre">
            <b>fingerprint</b>
            {` = sha256( phone_e164 + "|" + requested_time_utc )\n\nINSERT INTO calls (...) VALUES (...)\n`}
            <b>ON CONFLICT DO NOTHING</b>
            {`        -- call_id or fingerprint already present? then nothing is written\n-- changes = 1  → 201 created      changes = 0  → look up the existing row → 200 duplicate`}
          </pre>
          <p className="note">
            The caller&apos;s name and the reason are left out of the fingerprint on purpose. Speech-to-text spells the same person differently (&quot;Jon&quot;, &quot;John&quot;) and a language model never words a summary the same way twice, so including them would let real repeats through.
          </p>
        </section>

        <section id="flow">
          <Head eyebrow="4 · Dashboard data" title="The page asks one question every three seconds">
            All seven panels are drawn from a single snapshot, so the numbers on screen always agree with each other.
          </Head>
          <Figure
            caption={
              <>
                <b>Two details that matter.</b> Days are counted in the clinic&apos;s timezone and not in UTC, so a call at 10 pm New York time belongs to that evening even though UTC has already rolled over. The day boundaries are built with plain date arithmetic, so a 23-hour or 25-hour daylight-saving day cannot skip or repeat a bar.
              </>
            }
          >
            <DashboardFlowDiagram />
          </Figure>
        </section>

        <section id="security">
          <Head eyebrow="5 · Security" title="Each boundary has one control and one test that proves it">
            The data is personal (names and phone numbers), so every place it crosses a boundary has a check. The last line of each card is the name of the automated test that would fail if the control were removed.
          </Head>
          <div className="grid2">
            {CONTROLS.map((control) => (
              <div key={control.title} className="card">
                <h3>{control.title}</h3>
                <p>{control.body}</p>
                <div className="proof">
                  <b>{control.proofLabel}</b> {control.proof}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="decisions">
          <Head eyebrow="6 · Decisions" title="The choices that were made, and what each one costs" />
          <div className="card">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Decision</th>
                    <th>Why</th>
                    <th>Cost, and what changes at scale</th>
                  </tr>
                </thead>
                <tbody>
                  {DECISIONS.map((row) => (
                    <tr key={row.decision}>
                      <td>{row.decision}</td>
                      <td>{row.why}</td>
                      <td>{row.cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <footer className="foot muted small">Every name and number in the demo is fictional sample data.</footer>
      </main>
    </div>
  );
}
