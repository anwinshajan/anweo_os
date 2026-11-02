// Anweo mark: rounded square outline with the lime dot, plus the wide-tracked wordmark.
export function Mark({ size = 36, tile = true }: { size?: number; tile?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      {tile && <rect width="48" height="48" rx="12" fill="#0E5A44" />}
      <rect x="9" y="15" width="21" height="21" rx="6" fill="none" stroke="#F4F3EF" strokeWidth="2.6" />
      <circle cx="33" cy="14" r="5.2" fill="#C9F25A" />
    </svg>
  );
}

export function Logo({ onDark = false, size = 34 }: { onDark?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Mark size={size} tile={!onDark} />
      <span className={`text-[15px] font-bold tracking-[0.34em] ${onDark ? "text-paper" : "text-ink"}`}>ANWEO</span>
    </span>
  );
}

// The signature brand corner: a thick rounded "pipe" bending into the frame.
export function Corner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <path d="M0 0v62a32 32 0 0 0 32 32h88" fill="none" stroke="currentColor" strokeWidth="26" />
    </svg>
  );
}
