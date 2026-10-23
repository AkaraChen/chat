export function Spinner({ size = 16, light = false }: { size?: number; light?: boolean }) {
  const color = light ? "#FFFFFF" : "#1A73E8";
  const track = light ? "rgba(255,255,255,0.35)" : "rgba(26,115,232,0.25)";
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
