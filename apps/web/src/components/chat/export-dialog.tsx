import {
  exportDurationMs,
  exportPath,
  type ExportAccess,
  type ExportDuration,
} from "@my-better-t-app/api/export/duration";
import { XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { client } from "@/utils/orpc";

const accessChoices: ExportAccess[] = ["signed-in", "public"];
const durationChoices: ExportDuration[] = ["10m", "1h", "1d", "7d"];

const durationKey = {
  "10m": "duration10m",
  "1h": "duration1h",
  "1d": "duration1d",
  "7d": "duration7d",
} as const;

/** "Oct 26, 2026, 9:41 AM", or without the year once the link exists. */
export function formatExportTime(date: Date, locale: string, withYear: boolean): string {
  const loc = locale.startsWith("zh") ? "zh-CN" : "en-US";
  const day = new Intl.DateTimeFormat(loc, {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" as const } : {}),
  }).format(date);
  const time = new Intl.DateTimeFormat(loc, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  // Combined date+time inserts "at" on current en-US. The dialog uses a comma.
  return `${day}, ${time}`.replaceAll("\u202f", " ");
}

type Created = { url: string; access: ExportAccess; expiresAt: Date };

export function ExportDialog({
  open,
  threadId,
  title,
  onClose,
}: {
  open: boolean;
  threadId: string | undefined;
  title: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [access, setAccess] = useState<ExportAccess>("signed-in");
  const [duration, setDuration] = useState<ExportDuration>("1d");
  const [created, setCreated] = useState<Created | null>(null);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [seenOpen, setSeenOpen] = useState(false);

  if (open && !seenOpen) {
    setSeenOpen(true);
    setNow(new Date());
  }
  if (!open && (seenOpen || created || access !== "signed-in" || duration !== "1d")) {
    setSeenOpen(false);
    setCreated(null);
    setAccess("signed-in");
    setDuration("1d");
    setPending(false);
  }

  const helper =
    duration === "10m"
      ? t("export.stopsIn10m")
      : duration === "1h"
        ? t("export.stopsIn1h")
        : t("export.stopsAt", {
            time: formatExportTime(
              new Date(now.getTime() + exportDurationMs[duration]),
              i18n.language,
              true,
            ),
          });

  async function create() {
    if (!threadId || pending) return;
    setPending(true);
    try {
      const minted = await client.threads.export({ id: threadId, access, duration });
      setCreated({
        url: `${window.location.origin}${exportPath(minted.token)}`,
        access,
        expiresAt: new Date(minted.expiresAt),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("export.failed"));
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
    } catch {
      // The address stays on screen, so it can still be selected.
    }
  }

  return (
    <div
      role="dialog"
      aria-labelledby="export-chat-title"
      aria-hidden={!open}
      inert={!open}
      data-open={open}
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-[#1C1C1E52]"
    >
      <div className="modal-panel w-[480px] max-w-[94vw] overflow-hidden rounded-[16px] border border-[#E3E3E7] bg-white shadow-[0_24px_64px_#1018282E]">
        <div className="flex flex-col gap-0.5 px-6 pt-[22px]">
          <div className="flex items-center justify-between">
            <h2
              id="export-chat-title"
              className="text-[15px] leading-[26px] font-medium tracking-[-0.01em] text-[#1C1C1E]"
            >
              {t("export.title")}
            </h2>
            <button
              type="button"
              aria-label={t("common.close")}
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-full text-[#6E6E73] hover:bg-[#F7F7F9]"
            >
              <XIcon size={16} />
            </button>
          </div>
          <p className="text-[13px] leading-[18px] text-[#6E6E73]">
            {t("export.snapshot", { title })}
          </p>
        </div>
        {created ? (
          <div className="px-6 pt-5 pb-1">
            <div className="overflow-hidden rounded-xl border border-[#E3E3E7]">
              <div className="flex h-11 items-center gap-3 pr-1.5 pl-3.5">
                <p className="min-w-0 flex-1 truncate font-mono text-[13px] leading-[18px] text-[#1C1C1E]">
                  {created.url}
                </p>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="flex h-8 shrink-0 items-center rounded-lg bg-[#F7F7F9] px-3 text-[13px] leading-4 font-medium text-[#1C1C1E]"
                >
                  {t("export.copy")}
                </button>
              </div>
              <p className="border-t border-[#E3E3E7] px-3.5 pt-2 pb-[9px] text-[12px] leading-4 text-[#6E6E73]">
                {t("export.caption", {
                  access: t(created.access === "public" ? "export.public" : "export.signedIn"),
                  time: formatExportTime(created.expiresAt, i18n.language, false),
                })}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-[22px] px-6 pt-[22px] pb-2">
            <div className="flex flex-col gap-2" role="radiogroup" aria-label={t("export.who")}>
              <p className="text-[13px] leading-[18px] font-medium text-[#1C1C1E]">
                {t("export.who")}
              </p>
              {accessChoices.map((choice) => {
                const checked = access === choice;
                return (
                  <button
                    key={choice}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={t(choice === "public" ? "export.public" : "export.signedIn")}
                    onClick={() => setAccess(choice)}
                    className={`flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left ${
                      checked ? "border-[#C9DDF8] bg-[#F3F8FE]" : "border-[#E3E3E7] bg-white"
                    }`}
                  >
                    <span
                      className={`mt-px flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                        checked ? "border-[#1A73E8]" : "border-[#B4B4BA]"
                      }`}
                    >
                      {checked ? <span className="size-[6.5px] rounded-full bg-[#1A73E8]" /> : null}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[13px] leading-[18px] font-medium text-[#1C1C1E]">
                        {t(choice === "public" ? "export.public" : "export.signedIn")}
                      </span>
                      <span className="text-[12px] leading-4 text-[#6E6E73]">
                        {t(choice === "public" ? "export.publicDetail" : "export.signedInDetail")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-[13px] leading-[18px] font-medium text-[#1C1C1E]">
                {t("export.expires")}
              </p>
              <div
                role="radiogroup"
                aria-label={t("export.expires")}
                className="flex items-center gap-0.5 rounded-[10px] bg-[#F7F7F9] p-[3px]"
              >
                {durationChoices.map((choice) => {
                  const checked = duration === choice;
                  return (
                    <button
                      key={choice}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => setDuration(choice)}
                      className={`flex h-[30px] flex-1 items-center justify-center rounded-lg text-[13px] leading-4 ${
                        checked
                          ? "bg-white font-medium text-[#1C1C1E] shadow-[0_1px_2px_#10182814]"
                          : "text-[#6E6E73]"
                      }`}
                    >
                      {t(`export.${durationKey[choice]}`)}
                    </button>
                  );
                })}
              </div>
              <p className="text-[12px] leading-4 text-[#6E6E73]">{helper}</p>
            </div>
          </div>
        )}
        <div
          className={`flex items-center gap-2 px-6 pt-4 pb-[18px] ${created ? "justify-between" : "justify-end"}`}
        >
          {created ? (
            <>
              <button
                type="button"
                onClick={() => setCreated(null)}
                className="flex h-9 items-center rounded-[10px] px-3.5 text-[13px] font-medium text-[#A33B3B]"
              >
                {t("export.revoke")}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 items-center rounded-[10px] bg-[#1A73E8] px-3.5 text-[13px] font-medium text-white"
              >
                {t("export.done")}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 items-center rounded-[10px] px-3.5 text-[13px] font-medium text-[#6E6E73]"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void create()}
                disabled={pending || !threadId}
                className="flex h-9 items-center rounded-[10px] bg-[#1A73E8] px-3.5 text-[13px] font-medium text-white disabled:opacity-60"
              >
                {t("export.create")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
