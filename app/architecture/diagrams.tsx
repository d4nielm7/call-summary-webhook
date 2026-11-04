import { Fragment } from "react";

function Markers({ prefix, size }: { prefix: string; size: number }) {
  return (
    <defs>
      <marker id={`${prefix}-m`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth={size} markerHeight={size} orient="auto">
        <path className="h-m" d="M0 0L10 5L0 10z" />
      </marker>
      <marker id={`${prefix}-a`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth={size} markerHeight={size} orient="auto">
        <path className="h-a" d="M0 0L10 5L0 10z" />
      </marker>
    </defs>
  );
}

export function OverviewDiagram() {
  return (
    <svg viewBox="0 0 1200 490" role="img" aria-label="Overview. The AI receptionist, or the simulator, sends a signed call summary to the server. The server checks the sender, tidies the data, catches repeats and stores each call once in a database. The staff dashboard asks the server for numbers, which the server reads from the same database.">
      <Markers prefix="o" size={9} />

      <text className="tag-l" x={20} y={32}>OUTSIDE THE SERVER</text>
      <text className="tag-l" x={400} y={32}>THE SERVER · ONE PROCESS</text>
      <text className="tag-l" x={940} y={32}>STORAGE</text>

      <rect className="box hot" x={20} y={84} width={240} height={84} rx={14} />
      <text className="ttl-l" x={38} y={118}>AI receptionist</text>
      <text className="sub-l" x={38} y={142}>Sends a summary when a call ends</text>
      <rect className="box" x={20} y={196} width={240} height={84} rx={14} />
      <text className="ttl-l" x={38} y={230}>Simulator</text>
      <text className="sub-l" x={38} y={254}>Fictional calls, for the demo</text>
      <rect className="box" x={20} y={344} width={240} height={84} rx={14} />
      <text className="ttl-l" x={38} y={378}>Staff dashboard</text>
      <text className="sub-l" x={38} y={402}>A live view in the browser</text>

      <rect className="proc" x={400} y={52} width={400} height={420} rx={18} />
      <rect className="lane" x={416} y={68} width={368} height={232} rx={12} />
      <text className="tag-l" x={432} y={92}>RECEIVE A CALL</text>
      <circle className="num-c" cx={444} cy={128} r={12} />
      <text className="num-t" x={444} y={132.5} textAnchor="middle">1</text>
      <text className="step" x={466} y={133}>Check it is really the receptionist</text>
      <circle className="num-c" cx={444} cy={170} r={12} />
      <text className="num-t" x={444} y={174.5} textAnchor="middle">2</text>
      <text className="step" x={466} y={175}>Check and tidy the data</text>
      <circle className="num-c" cx={444} cy={212} r={12} />
      <text className="num-t" x={444} y={216.5} textAnchor="middle">3</text>
      <text className="step" x={466} y={217}>Catch repeats</text>
      <circle className="num-c" cx={444} cy={254} r={12} />
      <text className="num-t" x={444} y={258.5} textAnchor="middle">4</text>
      <text className="step" x={466} y={259}>Store it once</text>

      <rect className="lane" x={416} y={316} width={368} height={144} rx={12} />
      <text className="tag-l" x={432} y={340}>SHOW WHAT HAPPENED</text>
      <text className="step" x={432} y={376}>The dashboard page and its live numbers</text>
      <text className="sub-l" x={432} y={400}>Needs an access key to see any data</text>
      <text className="sub-l" x={432} y={422}>Refreshes every 3 seconds</text>

      <rect className="box hot" x={940} y={130} width={240} height={190} rx={14} />
      <text className="ttl-l" x={958} y={166}>Database</text>
      <text className="sub-l" x={958} y={188}>One SQLite file</text>
      <rect className="inner" x={956} y={204} width={208} height={46} rx={8} />
      <text className="chip-n" x={970} y={224}>calls</text>
      <text className="chip-d" x={970} y={241}>each real call, once</text>
      <rect className="inner" x={956} y={258} width={208} height={46} rx={8} />
      <text className="chip-n" x={970} y={278}>events</text>
      <text className="chip-d" x={970} y={295}>every delivery, no caller data</text>

      <line className="flow hot" x1={260} y1={128} x2={414} y2={128} markerEnd="url(#o-a)" />
      <text className="lbl-l" x={326} y={116} textAnchor="middle">signed call summary</text>
      <line className="flow hot" x1={260} y1={238} x2={414} y2={238} markerEnd="url(#o-a)" />
      <text className="lbl-l" x={326} y={226} textAnchor="middle">the same kind of call</text>
      <line className="flow" x1={260} y1={386} x2={414} y2={386} markerEnd="url(#o-m)" />
      <text className="lbl-l" x={326} y={374} textAnchor="middle">asks for the numbers</text>
      <line className="flow hot" x1={784} y1={254} x2={938} y2={254} markerEnd="url(#o-a)" />
      <text className="lbl-l" x={861} y={242} textAnchor="middle">store once</text>
      <path className="flow" d="M784 386 L1060 386 L1060 322" markerEnd="url(#o-m)" />
      <text className="lbl-l" x={920} y={374} textAnchor="middle">reads the numbers</text>
    </svg>
  );
}

export function SystemDiagram() {
  return (
    <svg viewBox="0 0 1200 572" role="img" aria-label="System architecture. Callers send signed requests to a single Node process, which writes to one SQLite file. The dashboard reads the same file through a token-protected endpoint.">
      <Markers prefix="s" size={8} />

      <text className="tag" x={20} y={26}>CALLERS</text>
      <text className="tag" x={340} y={26}>SERVER · ONE NEXT.JS PROCESS</text>
      <text className="tag" x={1000} y={26}>STORAGE</text>

      <rect className="proc" x={340} y={40} width={540} height={516} rx={18} />

      <rect className="lane" x={352} y={56} width={516} height={134} rx={12} />
      <text className="tag" x={368} y={78}>POST /api/webhooks/call-summary</text>
      <rect className="box hot" x={368} y={100} width={148} height={72} rx={10} />
      <text className="nm" x={442} y={128} textAnchor="middle">signature.ts</text>
      <text className="ds" x={442} y={148} textAnchor="middle">verify the HMAC</text>
      <rect className="box hot" x={536} y={100} width={148} height={72} rx={10} />
      <text className="nm" x={610} y={128} textAnchor="middle">schema.ts</text>
      <text className="ds" x={610} y={148} textAnchor="middle">clean + validate</text>
      <rect className="box hot" x={704} y={100} width={148} height={72} rx={10} />
      <text className="nm" x={778} y={128} textAnchor="middle">store.ts</text>
      <text className="ds" x={778} y={148} textAnchor="middle">dedupe + save</text>
      <line className="flow hot" x1={516} y1={136} x2={534} y2={136} markerEnd="url(#s-a)" />
      <line className="flow hot" x1={684} y1={136} x2={702} y2={136} markerEnd="url(#s-a)" />

      <rect className="lane" x={352} y={214} width={516} height={108} rx={12} />
      <text className="tag" x={852} y={236} textAnchor="end">POST /api/demo/simulate · DEMO MODE ONLY</text>
      <rect className="box" x={368} y={250} width={230} height={60} rx={10} />
      <text className="nm" x={383} y={276}>simulator.ts</text>
      <text className="ds" x={383} y={295}>invents callers, signs them</text>
      <text className="ds" x={620} y={272}>Driven by the dashboard buttons</text>
      <text className="ds" x={620} y={290}>and by the demo timer (every 2.5-6 s)</text>

      <rect className="lane" x={352} y={336} width={516} height={200} rx={12} />
      <text className="tag" x={368} y={358}>GET /api/dashboard · GET /</text>
      <rect className="box" x={368} y={372} width={484} height={64} rx={10} />
      <text className="nm" x={384} y={398}>dashboard.ts</text>
      <text className="ds" x={384} y={418}>counts per clinic day · totals · live feed · requested times</text>
      <rect className="box" x={368} y={452} width={484} height={64} rx={10} />
      <text className="nm" x={384} y={478}>app/page.tsx</text>
      <text className="ds" x={384} y={498}>a React page; the HTML it ships holds no data</text>

      <rect className="box" x={20} y={62} width={180} height={70} rx={12} />
      <text className="ttl" x={34} y={88}>AI receptionist</text>
      <text className="ds" x={34} y={106}>Production sender</text>
      <text className="dm" x={34} y={123}>HMAC-signed JSON</text>
      <rect className="box" x={20} y={146} width={180} height={60} rx={12} />
      <text className="ttl" x={34} y={172}>Any HTTP client</text>
      <text className="dm" x={34} y={190}>curl, test scripts</text>
      <rect className="box" x={20} y={256} width={180} height={280} rx={12} />
      <text className="dm" x={34} y={288}>Demo buttons</text>
      <text className="ttl" x={34} y={338}>Dashboard</text>
      <text className="ds" x={34} y={358}>token-gated, open in demo</text>
      <text className="ds" x={34} y={376}>polls every 3 s</text>
      <text className="dm" x={34} y={408}>Live numbers</text>
      <text className="dm" x={34} y={488}>Page load</text>

      <line className="flow hot" x1={200} y1={116} x2={366} y2={116} markerEnd="url(#s-a)" />
      <text className="lb" x={284} y={108} textAnchor="middle">POST · signed JSON</text>
      <text className="lm" x={284} y={132} textAnchor="middle">X-Webhook-Signature</text>
      <line className="flow hot" x1={200} y1={160} x2={366} y2={160} markerEnd="url(#s-a)" />
      <text className="lb" x={284} y={152} textAnchor="middle">same signed request</text>

      <line className="flow" x1={200} y1={284} x2={366} y2={284} markerEnd="url(#s-m)" />
      <text className="lb" x={284} y={276} textAnchor="middle">click a demo button</text>
      <text className="lb" x={284} y={300} textAnchor="middle">no key needed</text>
      <line className="flow" x1={200} y1={404} x2={366} y2={404} markerEnd="url(#s-m)" />
      <text className="lm" x={284} y={396} textAnchor="middle">GET /api/dashboard</text>
      <text className="lb" x={284} y={420} textAnchor="middle">Bearer token · every 3 s</text>
      <line className="flow" x1={200} y1={484} x2={366} y2={484} markerEnd="url(#s-m)" />
      <text className="lm" x={284} y={476} textAnchor="middle">GET /</text>
      <text className="lb" x={284} y={500} textAnchor="middle">page + assets, no data</text>

      <path className="flow hot" d="M442 250 L442 174" markerEnd="url(#s-a)" />
      <text className="lb" x={454} y={206}>delivers in-process, signed</text>

      <rect className="box" x={1000} y={62} width={180} height={270} rx={14} />
      <text className="ttl" x={1014} y={88}>SQLite file</text>
      <text className="dm" x={1014} y={106}>data/calls.db</text>
      <rect className="inner" x={1012} y={118} width={156} height={100} rx={8} />
      <text className="nm" x={1024} y={138}>calls</text>
      <text className="dm" x={1024} y={156}>call_id · UNIQUE</text>
      <text className="dm" x={1024} y={172}>fingerprint · UNIQUE</text>
      <text className="dm" x={1024} y={188}>name · phone · reason</text>
      <text className="dm" x={1024} y={204}>requested_time (UTC)</text>
      <rect className="inner" x={1012} y={228} width={156} height={92} rx={8} />
      <text className="nm" x={1024} y={247}>events</text>
      <text className="dm" x={1024} y={265}>outcome · at</text>
      <text className="dm" x={1024} y={280}>call_ref → calls.id</text>
      <text className="dm" x={1024} y={295}>no caller data</text>
      <text className="dm" x={1024} y={310}>pruned past 20,000</text>

      <rect className="box" x={1000} y={452} width={180} height={64} rx={12} />
      <text className="nm" x={1014} y={474}>app/</text>
      <text className="dm" x={1014} y={492}>page.tsx · globals.css</text>
      <text className="dm" x={1014} y={507}>Geist fonts (OFL)</text>

      <line className="flow hot" x1={852} y1={124} x2={1010} y2={124} markerEnd="url(#s-a)" />
      <text className="lb" x={932} y={116} textAnchor="middle">atomic insert</text>
      <path className="flow" d="M852 152 L980 152 L980 264 L1010 264" markerEnd="url(#s-m)" />
      <text className="lb" x={916} y={144} textAnchor="middle">log outcome</text>
      <path className="flow" d="M852 404 L1090 404 L1090 334" markerEnd="url(#s-m)" />
      <text className="lb" x={970} y={396} textAnchor="middle">read-only SELECTs</text>
      <line className="flow" x1={852} y1={484} x2={998} y2={484} markerEnd="url(#s-m)" />
      <text className="lb" x={925} y={476} textAnchor="middle">built from</text>
    </svg>
  );
}

const STEPS = [
  { x: 20, name: "Signature", note: "HMAC of the raw body" },
  { x: 216, name: "Size", note: "body at most 64 KB" },
  { x: 412, name: "Parse", note: "body must be JSON" },
  { x: 608, name: "Validate", note: "clean and check 4 fields" },
  { x: 804, name: "Store", note: "one atomic INSERT" },
  { x: 1000, name: "Record", note: "outcome into events" },
];

const ANSWERS = [
  { x: 100, width: 104, tone: "bad", code: "401", label: "unauthorized" },
  { x: 296, width: 104, tone: "bad", code: "413", label: "too large" },
  { x: 492, width: 104, tone: "bad", code: "400", label: "invalid JSON" },
  { x: 688, width: 104, tone: "bad", code: "422", label: "fields listed" },
  { x: 844, width: 76, tone: "ok", code: "201", label: "created" },
  { x: 924, width: 76, tone: "dup", code: "200", label: "duplicate" },
];

const LOG_NOTE = ["Every outcome is logged,", "with no caller data.", "A logging error never", "fails the request."];

export function RequestPathDiagram() {
  return (
    <svg viewBox="0 0 1200 232" role="img" aria-label="Request path in six steps: signature, size, parse, validate, store, record. The first four steps can refuse the request with 401, 413, 400 or 422. The store step answers 201 created or 200 duplicate.">
      <Markers prefix="p" size={8} />

      {STEPS.map((step, i) => (
        <Fragment key={step.name}>
          <text className="tag" x={step.x} y={48}>
            {`STEP ${i + 1}`}
          </text>
          <rect className={i < 5 ? "box hot" : "box"} x={step.x} y={58} width={160} height={70} rx={10} />
          <text className="nm" x={step.x + 14} y={88}>
            {step.name}
          </text>
          <text className="ds" x={step.x + 14} y={108}>
            {step.note}
          </text>
        </Fragment>
      ))}

      {STEPS.slice(0, 5).map((step, i) => (
        <line key={step.name} className="flow hot" x1={step.x + 160} y1={93} x2={STEPS[i + 1]!.x - 2} y2={93} markerEnd="url(#p-a)" />
      ))}

      {ANSWERS.map((answer) => (
        <Fragment key={answer.code}>
          <line
            className={answer.tone === "bad" ? "flow" : "flow hot"}
            x1={answer.x}
            y1={128}
            x2={answer.x}
            y2={166}
            markerEnd={answer.tone === "bad" ? "url(#p-m)" : "url(#p-a)"}
          />
          <rect className={`out ${answer.tone}`} x={answer.x - answer.width / 2} y={168} width={answer.width} height={44} rx={10} />
          <text className="code" x={answer.x} y={187} textAnchor="middle">
            {answer.code}
          </text>
          <text className="ds" x={answer.x} y={203} textAnchor="middle">
            {answer.label}
          </text>
        </Fragment>
      ))}

      {LOG_NOTE.map((line, i) => (
        <text key={line} className="ds" x={1000} y={158 + i * 16}>
          {line}
        </text>
      ))}
    </svg>
  );
}

export function DashboardFlowDiagram() {
  return (
    <svg viewBox="0 0 1200 246" role="img" aria-label="Dashboard data flow. The browser asks the dashboard endpoint for a snapshot, the endpoint checks the token, buildDashboard runs three read queries against SQLite, and the JSON snapshot returns to the browser, which redraws all seven panels.">
      <Markers prefix="f" size={8} />

      <rect className="box" x={20} y={50} width={160} height={70} rx={10} />
      <text className="nm" x={34} y={80}>dashboard.tsx</text>
      <text className="ds" x={34} y={100}>timer, every 3 s</text>
      <rect className="box" x={270} y={50} width={160} height={70} rx={10} />
      <text className="nm" x={284} y={80}>/api/dashboard</text>
      <text className="ds" x={284} y={100}>Bearer token, ?days=N</text>
      <rect className="box" x={520} y={50} width={160} height={70} rx={10} />
      <text className="nm" x={534} y={80}>buildDashboard()</text>
      <text className="ds" x={534} y={100}>one consistent snapshot</text>
      <rect className="box" x={770} y={50} width={160} height={70} rx={10} />
      <text className="nm" x={784} y={80}>CallStore</text>
      <text className="ds" x={784} y={100}>three read queries</text>
      <rect className="box" x={1020} y={50} width={160} height={70} rx={10} />
      <text className="nm" x={1034} y={80}>SQLite</text>
      <text className="ds" x={1034} y={100}>events · calls</text>

      <line className="flow" x1={180} y1={85} x2={268} y2={85} markerEnd="url(#f-m)" />
      <text className="lm" x={224} y={77} textAnchor="middle">GET</text>
      <line className="flow" x1={430} y1={85} x2={518} y2={85} markerEnd="url(#f-m)" />
      <text className="lb" x={474} y={77} textAnchor="middle">token ok</text>
      <line className="flow" x1={680} y1={85} x2={768} y2={85} markerEnd="url(#f-m)" />
      <text className="lb" x={724} y={77} textAnchor="middle">3 queries</text>
      <line className="flow" x1={930} y1={85} x2={1018} y2={85} markerEnd="url(#f-m)" />
      <text className="lm" x={974} y={77} textAnchor="middle">SELECT</text>

      <path className="flow hot" d="M600 120 L600 176 L100 176 L100 122" markerEnd="url(#f-a)" />
      <text className="lb" x={350} y={168} textAnchor="middle">JSON snapshot: totals · daily · calls · requested times · feed</text>
      <text className="ds" x={20} y={216}>The page then redraws all seven panels. While it reloads it keeps the previous frame on screen, so nothing flashes or jumps.</text>
    </svg>
  );
}
