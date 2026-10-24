import { useRef, useState } from "react";

import { Composer } from "./composer";
import { useModelChoice } from "./use-model-choice";

// One per template: meeting, pull request review, economy.
const prompts = [
  "Turn these meeting notes into decisions, open items and who owns what.",
  "Review the pull request owner/repo#123.",
  "Chart these figures and lay them out as a table.",
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
    <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
      <div className="flex w-full max-w-[680px] flex-col">
        <h1 className="mb-8 text-center text-[34px] leading-[40px] font-semibold tracking-[-0.025em] text-[#1C1C1E]">
          Hello, {name}
        </h1>
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={send}
          busy={busy}
          disabled={!ready}
          placeholder={ready ? "Message" : "Choose a model to start"}
          inputRef={input}
        />
        <ul className="mt-5 grid grid-cols-3 gap-3">
          {prompts.map((prompt) => (
            <li key={prompt} className="flex">
              <button
                type="button"
                onClick={() => fill(prompt)}
                className="flex-1 rounded-2xl bg-[#F3F3F5] px-4 py-3.5 text-left text-[13px] leading-[18px] text-[#1C1C1E] transition-colors hover:bg-[#EAEAED]"
              >
                {prompt}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
