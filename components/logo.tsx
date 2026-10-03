// Faceted diamond mark.
export function Logo({ className, strokeWidth = 1.6 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" className={className}>
      <path d="M7 4H21L26 11L14 24L2 11Z" stroke="var(--ice)" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path
        d="M2 11H26M7 4L11 11L14 4L17 11L21 4M11 11L14 24L17 11"
        stroke="var(--ice)"
        strokeWidth={strokeWidth * 0.7}
        strokeLinejoin="round"
      />
    </svg>
  );
}
