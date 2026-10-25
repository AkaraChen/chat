import type { ChatMessage } from "@my-better-t-app/api/chat/message";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Messages } from "./messages";
import { toTurns } from "./turns";

/** A minted snapshot. No composer, so nothing here can send into the thread. */
export function ShareView({ title, messages }: { title: string; messages: ChatMessage[] }) {
  const turns = useMemo(() => toTurns(messages), [messages]);
  return (
    <div className="flex h-svh flex-col bg-paper">
      <header className="flex h-14 shrink-0 items-center px-6">
        <h1 className="truncate text-[15px] font-medium text-ink">{title}</h1>
      </header>
      <Messages turns={turns} streaming={false} error={null} />
    </div>
  );
}

export function ShareUnavailable({ reason }: { reason: "invalid" | "forbidden" }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-svh items-center justify-center bg-paper px-6">
      <p className="text-[15px] text-ink-secondary">
        {reason === "forbidden" ? t("export.signIn") : t("export.unavailable")}
      </p>
    </div>
  );
}
