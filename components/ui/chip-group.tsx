"use client";

import { cn } from "@/lib/utils";

export type ChipOption<T> = { label: string; value: T; disabled?: boolean };

// A row of toggle buttons; amber marks price targets, ice marks everything else.
export function ChipGroup<T extends string | number>(props: {
  legend: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  tone?: "ice" | "amber";
}) {
  const on = props.tone === "amber" ? "border-amber bg-amber font-medium text-amber-ink" : "border-ice bg-ice font-medium text-ice-ink";
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 p-0 font-mono text-[11px] tracking-[0.16em] text-muted">{props.legend}</legend>
      <div className="flex gap-2">
        {props.options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === props.value}
            disabled={o.disabled}
            onClick={() => props.onChange(o.value)}
            className={cn(
              "h-11 flex-1 cursor-pointer border font-mono text-[15px] transition-colors disabled:cursor-not-allowed disabled:opacity-35",
              o.value === props.value ? on : "border-line-strong text-text-2 hover:border-ice",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
