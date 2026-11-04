import type { FormEvent } from "react";
import { Brand } from "@/components/brand";

interface AccessGateProps {
  message: string;
  onSubmit: (key: string) => void;
}

export function AccessGate({ message, onSubmit }: AccessGateProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("key") ?? "").trim();
    if (value) onSubmit(value);
  }

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={handleSubmit} autoComplete="off">
        <div className="brand">
          <Brand />
        </div>
        <h1>Enter your access key</h1>
        <p className="muted">The dashboard shows caller details, so it is locked behind a key.</p>
        <label className="sr-only" htmlFor="gate-key">
          Access key
        </label>
        <input id="gate-key" name="key" type="password" placeholder="Access key" autoComplete="off" spellCheck={false} autoFocus />
        <button className="btn btn-primary" type="submit">
          Open dashboard
        </button>
        {message && (
          <p className="gate-error" role="alert">
            {message}
          </p>
        )}
      </form>
    </div>
  );
}
