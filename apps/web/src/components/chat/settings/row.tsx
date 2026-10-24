import type { ButtonHTMLAttributes } from "react";

/** The small action at the end of a settings row. */
export function RowButton({
  tone = "plain",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "plain" | "primary" }) {
  return (
    <button
      type="button"
      {...props}
      className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium disabled:opacity-50 ${
        tone === "primary"
          ? "bg-[#1A73E8] text-white"
          : "bg-[#F3F3F5] text-[#1C1C1E] hover:bg-[#EAEAED]"
      } ${className}`}
    />
  );
}
