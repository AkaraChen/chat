import { kindOf } from "@my-better-t-app/api/files/kind";
import {
  ArrowUpIcon,
  GlobeSimpleIcon,
  GlobeSimpleXIcon,
  PaperclipIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { FileUIPart } from "ai";
import { useEffect, useRef, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "../spinner";
import { FileMark } from "./file-mark";
import { usePreferences } from "./preferences";
import { useAttachments, type Attachment } from "./use-attachments";

const hasFiles = (event: React.DragEvent) => event.dataTransfer.types.includes("Files");

/**
 * The bordered tool card from the empty state and the thread. It holds the
 * files being attached; `onSend` gets them, and once it settles without
 * throwing they are cleared.
 */
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
  onSend: (files: FileUIPart[]) => void | Promise<void>;
  disabled?: boolean;
  busy?: boolean;
  placeholder: string;
  inputRef?: Ref<HTMLTextAreaElement>;
}) {
  const { t } = useTranslation();
  const own = useRef<HTMLTextAreaElement | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [prefs, setPrefs] = usePreferences();
  const attachments = useAttachments();
  const [dragging, setDragging] = useState(false);
  const canSend =
    !disabled &&
    !busy &&
    !attachments.uploading &&
    (value.trim() !== "" || attachments.parts.length > 0);
  const webOff = !prefs.webSearch;

  useEffect(() => {
    const el = own.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  function send() {
    if (!canSend) return;
    Promise.resolve(onSend(attachments.parts)).then(attachments.clear, () => {});
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        attachments.add(event.dataTransfer.files);
      }}
      className={`flex flex-col rounded-2xl border bg-paper px-4 pt-3 pb-3 shadow-[var(--elevation-card)] ${
        dragging ? "border-accent" : "border-line"
      }`}
    >
      {attachments.items.length > 0 ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {attachments.items.map((item) => (
            <AttachmentTile
              key={item.key}
              item={item}
              onRemove={() => attachments.remove(item.key)}
            />
          ))}
        </ul>
      ) : null}
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
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        // A screenshot pastes as a file. Copied text that also carries a
        // picture of itself (as office apps do) pastes as text.
        onPaste={(event) => {
          const data = event.clipboardData;
          if (data.files.length === 0 || data.types.includes("text/plain")) return;
          event.preventDefault();
          attachments.add(data.files);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          const command = event.metaKey || event.ctrlKey;
          if (!command && !prefs.enterToSend) return;
          event.preventDefault();
          send();
        }}
        className="max-h-[200px] min-h-12 flex-1 resize-none bg-transparent py-1 text-[15px] leading-6 text-ink outline-none placeholder:text-ink-tertiary"
      />
      <div className="mt-2 flex items-center gap-1">
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          tabIndex={-1}
          onChange={(event) => {
            if (event.target.files) attachments.add(event.target.files);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          aria-label={t("composer.attach")}
          onClick={() => picker.current?.click()}
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
          {/* Web search is on by default, so the switch lights up when it is off. */}
          <button
            type="button"
            aria-label={t("composer.webOff")}
            aria-pressed={webOff}
            title={webOff ? t("composer.webOffHint") : t("composer.webOnHint")}
            onClick={() => setPrefs({ webSearch: webOff })}
            className={`flex size-8 items-center justify-center rounded-full ${
              webOff ? "bg-accent-soft text-accent" : "text-ink-secondary hover:bg-recessed"
            }`}
          >
            {webOff ? <GlobeSimpleXIcon size={16} /> : <GlobeSimpleIcon size={16} />}
          </button>
          <button
            type="submit"
            aria-label={t("composer.send")}
            disabled={!canSend}
            className="flex size-9 items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-40"
          >
            {busy ? <Spinner size={16} light /> : <ArrowUpIcon size={16} weight="bold" />}
          </button>
        </span>
      </div>
    </form>
  );
}

function AttachmentTile({ item, onRemove }: { item: Attachment; onRemove: () => void }) {
  const { t } = useTranslation();
  const image = item.uploaded ? kindOf(item.mediaType) === "image" : item.preview !== null;
  const remove = (
    <button
      type="button"
      aria-label={t("composer.removeFile", { name: item.name })}
      onClick={onRemove}
      className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-solid/70 text-on-solid"
    >
      <XIcon size={10} weight="bold" />
    </button>
  );
  if (image) {
    return (
      <li
        aria-busy={!item.uploaded}
        className="relative size-14 overflow-hidden rounded-xl bg-recessed"
      >
        <img
          src={item.preview ?? item.uploaded?.url}
          alt={item.name}
          className={`size-full object-cover ${item.uploaded ? "" : "opacity-50"}`}
        />
        {item.uploaded ? null : (
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner size={16} />
          </span>
        )}
        {remove}
      </li>
    );
  }
  return (
    <li
      aria-busy={!item.uploaded}
      className="relative flex h-14 w-56 items-center gap-2.5 rounded-xl bg-recessed pr-7 pl-2.5"
    >
      {item.uploaded ? (
        <FileMark mediaType={item.mediaType} name={item.name} />
      ) : (
        <>
          <span className="flex size-9 shrink-0 items-center justify-center">
            <Spinner size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] leading-[18px] font-medium text-ink">
              {item.name}
            </span>
            <span className="block text-[12px] leading-4 text-ink-secondary">
              {t("composer.reading")}
            </span>
          </span>
        </>
      )}
      {remove}
    </li>
  );
}
