/**
 * Glyphs for the setting chips.
 *
 * A chip reads at a glance because the icon says which axis it belongs to
 * before the value is read — duration, framing, quality. Drawn inline as SVG
 * rather than pulled from a package: there are five of them, and a dependency
 * for five paths costs more than it saves.
 *
 * All are 14px, 1.5 stroke, currentColor, so they inherit the chip's state
 * colour and need no styling of their own.
 */
const base = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Duration. */
export function ClockIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** Aspect ratio. */
export function FrameIcon() {
  return (
    <svg {...base}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
    </svg>
  );
}

/** Resolution or image size. */
export function QualityIcon() {
  return (
    <svg {...base}>
      <path d="M12 3 4 8v8l8 5 8-5V8z" />
      <path d="M12 3v18" />
    </svg>
  );
}

/** Lens. */
export function LensIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Look, grade. */
export function LookIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Camera move. */
export function MoveIcon() {
  return (
    <svg {...base}>
      <path d="M4 12h16" />
      <path d="m15 7 5 5-5 5" />
    </svg>
  );
}

/** Count, as in how many images a batch returns. */
export function StackIcon() {
  return (
    <svg {...base}>
      <rect x="3" y="7" width="13" height="13" rx="2" />
      <path d="M8 4h11a2 2 0 0 1 2 2v11" />
    </svg>
  );
}

/** Sound on the take. */
export function SoundIcon() {
  return (
    <svg {...base}>
      <path d="M5 9v6h3l4 3V6L8 9H5Z" />
      <path d="M15.5 9.5a4 4 0 0 1 0 5" />
    </svg>
  );
}
