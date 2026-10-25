import { ClockIcon, FileTextIcon, LightbulbIcon } from "@phosphor-icons/react";
import { useRef, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";

import { Composer } from "./composer";
import { useModelChoice } from "./use-model-choice";

const cards: {
  id: "meeting" | "review" | "chart";
  Icon: ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: "meeting", Icon: ClockIcon },
  { id: "review", Icon: LightbulbIcon },
  { id: "chart", Icon: FileTextIcon },
];

export function EmptyPane({
  name,
  onStart,
}: {
  name: string;
  onStart: (text: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { ready } = useModelChoice();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement | null>(null);

  async function send() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      await onStart(text);
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  function fill(text: string) {
    setDraft(text);
    const el = input.current;
    if (el) {
      el.focus();
      requestAnimationFrame(() => el.setSelectionRange(text.length, text.length));
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10">
      <div className="flex w-full max-w-[760px] flex-col">
        <p className="text-center text-[15px] text-[#6E6E73]">{t("empty.hello", { name })}</p>
        <h1 className="mt-1 mb-8 text-center text-[34px] leading-[40px] font-semibold tracking-[-0.03em] text-[#1C1C1E]">
          {t("empty.title")}
        </h1>
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          busy={busy}
          disabled={!ready}
          placeholder={t("composer.placeholder")}
          inputRef={input}
        />
        <ul className="mt-4 grid grid-cols-3 gap-3">
          {cards.map(({ id, Icon }) => {
            const title = t(`empty.${id}Title`);
            const body = t(`empty.${id}Body`);
            return (
              <li key={id} className="flex">
                <button
                  type="button"
                  onClick={() => fill(body)}
                  className="flex flex-1 flex-col gap-2 rounded-2xl border border-[#DCDCE0] bg-white px-4 py-4 text-left"
                >
                  <Icon size={16} className="text-[#6E6E73]" />
                  <span className="text-[15px] font-semibold text-[#1C1C1E]">{title}</span>
                  <span className="text-[13px] leading-[18px] text-[#6E6E73]">{body}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
