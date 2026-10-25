export function Spinner({ size = 16, light = false }: { size?: number; light?: boolean }) {
  const color = light ? "var(--on-accent)" : "var(--accent)";
  const track = light
    ? "color-mix(in srgb, var(--on-accent) 35%, transparent)"
    : "color-mix(in srgb, var(--accent) 25%, transparent)";
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="animate-spin">
      <circle cx="8" cy="8" r="6" stroke={track} strokeWidth="2" fill="none" />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
