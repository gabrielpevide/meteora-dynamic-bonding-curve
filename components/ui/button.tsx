import { cn } from "@/lib/utils";

const variants = {
  primary: "facet-btn bg-ice text-ice-ink hover:bg-ice-hover",
  outline: "border border-line-strong text-text hover:border-ice",
};
const sizes = {
  md: "h-11 px-5 text-[15px]",
  lg: "h-14 px-7 text-base",
};

// Shared look for <button> and <Link> so both read as the same control.
export function buttonClass({
  variant = "primary",
  size = "md",
  className,
}: { variant?: keyof typeof variants; size?: keyof typeof sizes; className?: string } = {}) {
  return cn(
    "inline-flex cursor-pointer items-center justify-center gap-2 font-display font-semibold tracking-[0.04em] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );
}
