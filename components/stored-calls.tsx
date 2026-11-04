import type { DemoCall } from "@/lib/handlers/demo";
import { formatTime } from "./format";

interface StoredCallsProps {
  total: number;
  calls: DemoCall[];
  onClear: () => void;
  timeZone?: string;
}

export function StoredCalls({ total, calls, onClear, timeZone }: StoredCallsProps) {
  if (calls.length === 0) return <p className="muted">Nothing stored yet.</p>;

  return (
    <>
      <div className="stored-head">
        <span className="muted">
          {total} stored{total > calls.length ? `, showing the latest ${calls.length}` : ""}
        </span>
        <button className="link" type="button" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Received</th>
              <th>Caller</th>
              <th>Phone</th>
              <th>Reason</th>
              <th>Wants to come in</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <tr key={call.id}>
                <td>{formatTime(call.received_at, timeZone)}</td>
                <td>{call.caller_name}</td>
                <td className="mono">{call.phone}</td>
                <td>{call.reason}</td>
                <td>{formatTime(call.requested_time, timeZone)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
