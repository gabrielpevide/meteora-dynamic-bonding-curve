import { cn } from "@/lib/utils";

export type Phase = "curve" | "graduated" | "round" | "open";

const STEPS = ["01 CURVE", "02 GRADUATION", "03 CONVICTION ROUND", "04 OPEN"];
const ACTIVE: Record<Phase, number> = { curve: 0, graduated: 1, round: 2, open: 3 };

export function PhaseStepper({ phase, notes }: { phase: Phase; notes: [string, string, string, string] }) {
  const active = ACTIVE[phase];
  // The round is the only amber step: it is the moment holders set their price.
  const amber = phase === "round";
  return (
    <ol aria-label="Token phases" className="grid list-none grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-2">
      {STEPS.map((label, i) => {
        const state = i < active ? "done" : i === active ? "active" : "next";
        return (
          <li
            key={label}
            aria-current={state === "active" ? "step" : undefined}
            className={cn(
              "flex flex-col gap-1.5 px-4 py-3.5",
              state === "done" && "border border-line bg-surface",
              state === "active" && (amber ? "border border-amber bg-amber-wash" : "border border-ice bg-ice-wash"),
              state === "next" && "border border-dashed border-line-strong",
            )}
          >
            <span
              className={cn(
                "flex items-center gap-2 font-mono text-[11px] tracking-[0.16em]",
                state === "next" ? "text-faint" : state === "active" && amber ? "text-amber" : "text-ice",
              )}
            >
              {state === "done" && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 6.5L4.8 9L10 3" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              )}
              {label}
            </span>
            <span className={cn("text-sm", state === "active" ? "font-mono text-text" : state === "done" ? "text-text-2" : "text-faint")}>
              {notes[i]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
