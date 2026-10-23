import { Link } from "@tanstack/react-router";

export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="absolute top-7 left-7 flex h-9 items-center gap-2 rounded-full bg-[#F3F3F5] pr-3.5 pl-3 text-[13px] font-medium text-[#1C1C1E]"
    >
      <Chevron />
      {children}
    </Link>
  );
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none">
      <path
        d="M8.5 3 4.5 7l4 4"
        stroke="#1C1C1E"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
