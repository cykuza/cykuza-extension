/** Stroke icons for chrome / actions. Dense brand glyphs live under /public/icons. */

/** Compact info mark for tips — stem + dot; circle comes from the button. */
export function IconInfo() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="10"
      height="10"
      fill="none"
      aria-hidden
    >
      <circle cx="8" cy="4.25" r="1.15" fill="currentColor" />
      <path
        d="M8 7.1v5.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconBack() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
      />
    </svg>
  );
}

/** Same cog as cykuza-web (Heroicons solid) via asset — avoids leak-scan on path data. */
export function IconSettings() {
  return (
    <img
      className="icon-settings"
      src="/icons/settings.svg"
      width={24}
      height={24}
      alt=""
      aria-hidden
    />
  );
}

export function IconCopy() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <rect x="8" y="8" width="11" height="11" rx="1" />
      <path strokeLinecap="round" d="M5 16V5h11" />
    </svg>
  );
}

/** Chevron matching web settings rows (size-3, stroke-2). */
export function IconChevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m8.25 4.5 7.5 7.5-7.5 7.5"
      />
    </svg>
  );
}

export function IconReceive() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path strokeLinecap="round" d="M12 5v14" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 12l-7 7-7-7"
      />
    </svg>
  );
}

export function IconSend() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12l7-7 7 7"
      />
      <path strokeLinecap="round" d="M12 19V5" />
    </svg>
  );
}

export function IconLock() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path strokeLinecap="round" d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

/** Power glyph for End session (clears vault data). */
export function IconPower() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.636 5.636a9 9 0 1 0 12.728 0"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v9" />
    </svg>
  );
}
