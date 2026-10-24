import { Composer } from "./composer";
import { Messages } from "./messages";
import type { Turn } from "./turns";

/** The thread column: transcript plus the same tool card as the empty state. */
export function ThreadView({
  turns,
  streaming = false,
  error = null,
  draft,
  onDraft,
  onSend,
  disabled,
  busy,
}: {
  turns: Turn[];
  streaming?: boolean;
  error?: string | null;
  draft: string;
  onDraft: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <>
      <Messages turns={turns} streaming={streaming} error={error} />
      <div className="mx-auto w-full max-w-[720px] px-6 pb-6">
        <Composer
          value={draft}
          onChange={onDraft}
          onSend={onSend}
          busy={busy}
          disabled={disabled}
          placeholder="Ask me anything..."
        />
      </div>
    </>
  );
}
