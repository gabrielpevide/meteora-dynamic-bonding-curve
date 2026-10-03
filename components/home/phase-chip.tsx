import { fmtCountdown, fmtNumber } from "@/lib/format";
import type { LaunchSummary } from "@/lib/launches";
import { cn } from "@/lib/utils";

export function PhaseChip({ launch, now }: { launch: LaunchSummary; now: number }) {
  const { phase } = launch;
  const label =
    phase === "curve"
      ? `ON CURVE · ${fmtNumber(launch.progress * 100)}%`
      : phase === "graduated"
        ? "GRADUATED"
        : phase === "round"
          ? `ROUND · ${fmtCountdown((launch.opensAt ?? now) - now)}`
          : "OPEN";
  return (
    <span
      className={cn(
        "whitespace-nowrap border px-2 py-1 font-mono text-[11px] tracking-[0.12em]",
        phase === "round" && "border-amber-line text-amber",
        phase === "open" && "border-ice-line text-ice",
        (phase === "curve" || phase === "graduated") && "border-line-strong text-text-2",
      )}
    >
      {label}
    </span>
  );
}
