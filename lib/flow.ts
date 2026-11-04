export type StageId = "signature" | "validation" | "duplicate" | "store";
export type StageState = "idle" | "pass" | "stop" | "caught" | "skipped";

export interface Stage {
  id: StageId;
  title: string;
  state: StageState;
  note: string;
}

export interface FlowResult {
  status: number;
  body: { status?: string; matched_on?: string; errors?: Array<{ field: string; message: string }> };
}

const IDLE: Array<Pick<Stage, "id" | "title" | "note">> = [
  { id: "signature", title: "Signed?", note: "The HMAC of the body matches the shared secret." },
  { id: "validation", title: "Valid?", note: "Name, phone, reason and time are there and well formed." },
  { id: "duplicate", title: "Seen before?", note: "Same call id, or the same phone at the same time." },
  { id: "store", title: "Stored", note: "Written to the SQLite file." },
];

// What each gate did for one response. A gate after the one that stopped the request never ran.
export function describeFlow(result: FlowResult | null): Stage[] {
  const states = (...list: Array<[StageState, string?]>): Stage[] =>
    IDLE.map((stage, i) => ({ ...stage, state: list[i]?.[0] ?? "skipped", note: list[i]?.[1] ?? "Not reached." }));

  if (!result) return IDLE.map((stage) => ({ ...stage, state: "idle" }));

  const { status, body } = result;
  if (status === 201) {
    return states(["pass", "Signature matches."], ["pass", "All four fields are valid."], ["pass", "A new call."], ["pass", "Saved."]);
  }
  if (status === 200) {
    const by = body.matched_on === "call_id" ? "the call id" : "the phone and time";
    return states(["pass", "Signature matches."], ["pass", "All four fields are valid."], ["caught", `Already stored, matched on ${by}.`], ["skipped", "Nothing new written."]);
  }
  if (status === 422) {
    const fields = (body.errors ?? []).map((e) => e.field).join(", ");
    return states(["pass", "Signature matches."], ["stop", `Rejected: ${fields || "the body"} failed validation.`]);
  }
  if (status === 401) return states(["stop", "Signature does not match. Rejected."]);
  if (status === 400) return states(["pass", "Signature matches."], ["stop", "Rejected: the body is not JSON."]);
  if (status === 413) return states(["stop", "Rejected: the body is over 64 KB."]);
  return states(["skipped"], ["skipped"], ["skipped"], ["stop", "Storage failed. The sender should retry."]);
}
