import { useTranslation } from "react-i18next";

import { Spinner } from "../spinner";

/** A pane that has nothing to show yet: one spinner and one quiet line. */
export function PaneLoading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-3">
      <Spinner size={28} />
      <span className="text-[13px] leading-[18px] text-ink-secondary">
        {label ?? t("thread.loading")}
      </span>
    </div>
  );
}
