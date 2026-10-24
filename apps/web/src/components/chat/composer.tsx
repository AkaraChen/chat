import {
  GlobeIcon,
  MicrophoneIcon,
  PaperclipIcon,
  SlidersHorizontalIcon,
  SparkleIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type Ref } from "react";

import { Spinner } from "../spinner";
import { usePreferences } from "./preferences";

/** The bordered tool card from the empty state and the thread. */
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
  const [prefs] = usePreferences();
  const [deeper, setDeeper] = useState(false);
  const canSend = !disabled && !busy && value.trim() !== "";

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
      className="flex flex-col rounded-2xl border border-[#DCDCE0] bg-[#F7F7F9] px-4 pt-3 pb-3"
    >
      <textarea
        ref={(el) => {
          own.current = el;
          if (typeof inputRef === "function") inputRef(el);
          else if (inputRef) inputRef.current = el;
        }}
        value={value}
        rows={2}
        autoFocus
        placeholder={placeholder}
        spellCheck={prefs.spellCheck}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          const command = event.metaKey || event.ctrlKey;
          if (!command && !prefs.enterToSend) return;
          event.preventDefault();
          if (canSend) onSend();
        }}
        className="max-h-[200px] min-h-12 flex-1 resize-none bg-transparent py-1 text-[15px] leading-6 text-[#1C1C1E] outline-none placeholder:text-[#9E9EA4]"
      />
      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          aria-pressed={deeper}
          onClick={() => setDeeper((on) => !on)}
          className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ${
            deeper ? "bg-[#E8F1FD] text-[#1A73E8]" : "bg-white text-[#1A73E8]"
          }`}
        >
          <SparkleIcon size={14} weight="fill" />
          Deeper Research
        </button>
        <button
          type="button"
          aria-label="Attach"
          className="flex size-8 items-center justify-center rounded-full text-[#6E6E73] hover:bg-white"
        >
          <PaperclipIcon size={16} />
        </button>
        <button
          type="button"
          aria-label="Tools"
          className="flex size-8 items-center justify-center rounded-full text-[#6E6E73] hover:bg-white"
        >
          <SlidersHorizontalIcon size={16} />
        </button>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Microphone"
            className="flex size-8 items-center justify-center rounded-full text-[#6E6E73] hover:bg-white"
          >
            <WaveformIcon size={16} />
          </button>
          <button
            type="button"
            aria-label="Globe"
            className="flex size-8 items-center justify-center rounded-full text-[#6E6E73] hover:bg-white"
          >
            <GlobeIcon size={16} />
          </button>
          <button
            type="button"
            aria-label={canSend ? "Send" : "Voice"}
            onClick={() => {
              if (canSend) onSend();
            }}
            className="flex size-9 items-center justify-center rounded-full bg-[#1A73E8] text-white"
          >
            {busy ? <Spinner size={16} light /> : <MicrophoneIcon size={16} weight="fill" />}
          </button>
        </span>
      </div>
    </form>
  );
}
