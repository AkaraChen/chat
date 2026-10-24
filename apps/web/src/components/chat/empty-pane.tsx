import { ClockIcon, FileTextIcon, LightbulbIcon } from "@phosphor-icons/react";
import { useRef, useState, type ComponentType } from "react";

import { Composer } from "./composer";
import { useModelChoice } from "./use-model-choice";

const cards: {
  title: string;
  body: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
}[] = [
  {
    title: "Sort the meeting",
    body: "Pull the decisions, the open disputes, and who does what out of this morning's notes.",
    Icon: ClockIcon,
  },
  {
    title: "Review a pull request",
    body: "Review AkaraChen/chat#128. What blocks the merge, and what can ship?",
    Icon: LightbulbIcon,
  },
  {
    title: "Chart these figures",
    body: "Real GDP 1.8, 1.6, 1.8. Inflation 2.8, 2.6, 2.4. Chart it and make a table.",
    Icon: FileTextIcon,
  },
];

export function EmptyPane({
  name,
  onStart,
}: {
  name: string;
  onStart: (text: string) => Promise<void>;
}) {
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
        <p className="text-center text-[15px] text-[#6E6E73]">Hello, {name}</p>
        <h1 className="mt-1 mb-8 text-center text-[34px] leading-[40px] font-semibold tracking-[-0.03em] text-[#1C1C1E]">
          How can I assist you today?
        </h1>
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          busy={busy}
          disabled={!ready}
          placeholder="Ask me anything..."
          inputRef={input}
        />
        <ul className="mt-4 grid grid-cols-3 gap-3">
          {cards.map(({ title, body, Icon }) => (
            <li key={title} className="flex">
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
          ))}
        </ul>
      </div>
    </div>
  );
}
