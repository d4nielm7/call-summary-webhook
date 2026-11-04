import type { Stage, StageState } from "@/lib/flow";

const MARK: Record<StageState, string | null> = {
  idle: null,
  pass: "✓",
  stop: "✕",
  caught: "!",
  skipped: "–",
};

const LABEL: Record<StageState, string> = {
  idle: "waiting",
  pass: "passed",
  stop: "stopped here",
  caught: "caught",
  skipped: "not reached",
};

export function Pipeline({ stages }: { stages: Stage[] }) {
  return (
    <ol className="pipeline">
      {stages.map((stage, index) => (
        <li key={stage.id} className={`stage ${stage.state}`}>
          <span className="stage-head">
            <span className="stage-mark" aria-hidden="true">
              {MARK[stage.state] ?? index + 1}
            </span>
            <span className="stage-title">{stage.title}</span>
            <span className="sr-only"> ({LABEL[stage.state]})</span>
          </span>
          <span className="stage-note">{stage.note}</span>
        </li>
      ))}
    </ol>
  );
}
