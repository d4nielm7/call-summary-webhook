const PATHS = {
  check: "M3.5 8.5l3 3 6-6.5",
  copy: "M5.5 5.5h7v7h-7z M3.5 10.5v-7h7",
  alert: "M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M8 5v3.5 M8 10.8h.01",
  shield: "M8 2.2l4.6 1.8v3.6c0 2.7-2 4.6-4.6 5.9-2.6-1.3-4.6-3.2-4.6-5.9V4z",
  sun: "M8 10.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z M8 1.5v1.4 M8 13.1v1.4 M1.5 8h1.4 M13.1 8h1.4 M3.4 3.4l1 1 M11.6 11.6l1 1 M3.4 12.6l1-1 M11.6 4.4l1-1",
  moon: "M13.4 9.7A5.7 5.7 0 0 1 6.3 2.6a5.7 5.7 0 1 0 7.1 7.1z",
  lock: "M4.5 7.5h7v5.7h-7z M5.8 7.5V5.7a2.2 2.2 0 0 1 4.4 0v1.8",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
