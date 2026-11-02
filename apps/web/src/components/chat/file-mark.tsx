import { kindOf } from "@my-better-t-app/api/files/kind";
import { FileIcon, FilePdfIcon, FileTextIcon } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

/** The icon and the one word that say what kind of file a chip holds. */
export function FileMark({ mediaType, name }: { mediaType: string; name: string }) {
  const { t } = useTranslation();
  const kind = kindOf(mediaType);
  const Icon = kind === "pdf" ? FilePdfIcon : kind === "text" ? FileTextIcon : FileIcon;
  const extension = /\.([a-z0-9]{1,6})$/i.exec(name)?.[1]?.toUpperCase();
  const label =
    kind === "pdf"
      ? "PDF"
      : (extension ?? (kind === "text" ? t("files.text") : t("files.document")));
  return (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-paper text-ink-secondary">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] leading-[18px] font-medium text-ink">
          {name}
        </span>
        <span className="block text-[12px] leading-4 text-ink-secondary">{label}</span>
      </span>
    </>
  );
}
