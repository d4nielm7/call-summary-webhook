import type { IconName } from "@/components/icons";
import type { Outcome } from "@/lib/store";

export const OUTCOME_ORDER: readonly Outcome[] = ["created", "duplicate", "invalid", "unauthorized"];

export const OUTCOMES: Record<Outcome, { slot: 1 | 2 | 3 | 4; label: string; short: string; icon: IconName }> = {
  created: { slot: 1, label: "Stored", short: "Stored", icon: "check" },
  duplicate: { slot: 2, label: "Duplicate blocked", short: "Duplicate", icon: "copy" },
  invalid: { slot: 3, label: "Rejected as invalid", short: "Rejected", icon: "alert" },
  unauthorized: { slot: 4, label: "Bad signature", short: "Bad signature", icon: "shield" },
};
