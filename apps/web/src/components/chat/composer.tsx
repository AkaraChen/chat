import { ArrowUpIcon } from "@phosphor-icons/react";
import { useEffect, useRef, type Ref } from "react";

import { Spinner } from "../spinner";

/** Text and send. Enter sends, Shift+Enter starts a new line. */
export function Composer({
  value,
  onChange,
  onSend,
  disabled,
  busy,
  placeholder,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  busy?: boolean;
  placeholder: string;
  inputRef?: Ref<HTMLTextAreaElement>;
}) {
  const own = useRef<HTMLTextAreaElement | null>(null);
  const canSend = !disabled && !busy && value.trim() !== "";

  // Grow with the text, up to a limit.
  useEffect(() => {
    const el = own.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
      className="flex items-end gap-2 rounded-[22px] bg-[#F3F3F5] py-2 pr-2 pl-5"
    >
      <textarea
        ref={(el) => {
          own.current = el;
          if (typeof inputRef === "function") inputRef(el);
          else if (inputRef) inputRef.current = el;
        }}
        value={value}
        rows={1}
        autoFocus
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (canSend) onSend();
          }
        }}
        className="max-h-[200px] min-h-6 flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-6 text-[#1C1C1E] outline-none placeholder:text-[#9E9EA4]"
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1A73E8] text-white transition-opacity disabled:opacity-35"
      >
        {busy ? <Spinner size={16} light /> : <ArrowUpIcon size={18} weight="bold" />}
      </button>
    </form>
  );
}
