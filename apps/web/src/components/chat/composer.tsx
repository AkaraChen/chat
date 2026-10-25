import {
  GlobeIcon,
  MicrophoneIcon,
  PaperclipIcon,
  SlidersHorizontalIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, type Ref } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const own = useRef<HTMLTextAreaElement | null>(null);
  const [prefs] = usePreferences();
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
      className="flex flex-col rounded-2xl border border-line bg-paper px-4 pt-3 pb-3"
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
        className="max-h-[200px] min-h-12 flex-1 resize-none bg-transparent py-1 text-[15px] leading-6 text-ink outline-none placeholder:text-ink-tertiary"
      />
      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          aria-label={t("composer.attach")}
          className="flex size-8 items-center justify-center rounded-full text-ink-secondary hover:bg-recessed"
        >
          <PaperclipIcon size={16} />
        </button>
        <button
          type="button"
          aria-label={t("composer.tools")}
          className="flex size-8 items-center justify-center rounded-full text-ink-secondary hover:bg-recessed"
        >
          <SlidersHorizontalIcon size={16} />
        </button>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label={t("composer.microphone")}
            className="flex size-8 items-center justify-center rounded-full text-ink-secondary hover:bg-recessed"
          >
            <WaveformIcon size={16} />
          </button>
          <button
            type="button"
            aria-label={t("composer.globe")}
            className="flex size-8 items-center justify-center rounded-full text-ink-secondary hover:bg-recessed"
          >
            <GlobeIcon size={16} />
          </button>
          <button
            type="button"
            aria-label={canSend ? t("composer.send") : t("composer.voice")}
            onClick={() => {
              if (canSend) onSend();
            }}
            className="flex size-9 items-center justify-center rounded-full bg-accent text-on-accent"
          >
            {busy ? <Spinner size={16} light /> : <MicrophoneIcon size={16} weight="fill" />}
          </button>
        </span>
      </div>
    </form>
  );
}
