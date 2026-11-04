"use client";

import { useEffect } from "react";

export interface ToastMessage {
  id: number;
  status?: number;
  text: string;
}

export function Toast({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4200);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div className="toast" role="status" aria-live="polite">
      {toast.status !== undefined && (
        <>
          <strong>HTTP {toast.status}</strong> ·{" "}
        </>
      )}
      {toast.text}
    </div>
  );
}
