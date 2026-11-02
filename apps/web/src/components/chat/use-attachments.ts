import { MAX_FILE_BYTES, MAX_FILES, type UploadedFile } from "@my-better-t-app/api/files/kind";
import type { FileUIPart } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/** A file in the composer: uploading until `uploaded` is set. */
export type Attachment = {
  key: string;
  name: string;
  /** The browser's guess until the upload is in; then what the server made of it. */
  mediaType: string;
  /** An object URL, so an image shows before its upload finishes. */
  preview: string | null;
  uploaded: UploadedFile | null;
};

let keys = 0;

async function upload(file: File, signal: AbortSignal): Promise<UploadedFile> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/files", { method: "POST", body: form, signal });
  if (!response.ok) throw new Error((await response.text()) || response.statusText);
  return (await response.json()) as UploadedFile;
}

/**
 * The files the composer holds. Each uploads as soon as it is added, so it is
 * read (and a document converted) while the message is still being written.
 * A file that fails says why and leaves.
 */
export function useAttachments() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Attachment[]>([]);
  const shown = useRef(items);
  shown.current = items;
  const uploads = useRef(new Map<string, AbortController>());

  const drop = useCallback((key: string) => {
    uploads.current.get(key)?.abort();
    uploads.current.delete(key);
    const preview = shown.current.find((entry) => entry.key === key)?.preview;
    if (preview) URL.revokeObjectURL(preview);
    setItems((current) => current.filter((entry) => entry.key !== key));
  }, []);

  const add = useCallback(
    (files: Iterable<File>) => {
      let room = MAX_FILES - shown.current.length;
      for (const file of files) {
        if (room <= 0) {
          toast.error(t("composer.tooManyFiles", { count: MAX_FILES }));
          return;
        }
        if (file.size > MAX_FILE_BYTES) {
          toast.error(t("composer.fileTooLarge", { name: file.name, mb: MAX_FILE_BYTES >> 20 }));
          continue;
        }
        room -= 1;
        const key = `attachment-${++keys}`;
        const controller = new AbortController();
        uploads.current.set(key, controller);
        const item: Attachment = {
          key,
          name: file.name,
          mediaType: file.type,
          preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
          uploaded: null,
        };
        setItems((current) => [...current, item]);
        upload(file, controller.signal).then(
          (uploaded) => {
            uploads.current.delete(key);
            setItems((current) =>
              current.map((entry) =>
                entry.key === key ? { ...entry, mediaType: uploaded.mediaType, uploaded } : entry,
              ),
            );
          },
          (error: unknown) => {
            if (controller.signal.aborted) return;
            const reason = error instanceof Error ? error.message : String(error);
            toast.error(t("composer.uploadFailed", { name: file.name, reason }));
            drop(key);
          },
        );
      }
    },
    [drop, t],
  );

  // Sent: the transcript shows the files from the server now.
  const clear = useCallback(() => {
    for (const item of shown.current) if (item.preview) URL.revokeObjectURL(item.preview);
    setItems([]);
  }, []);

  // Leaving the screen stops what is still uploading.
  useEffect(() => {
    const pending = uploads.current;
    return () => {
      for (const controller of pending.values()) controller.abort();
    };
  }, []);

  const parts: FileUIPart[] = items.flatMap((item) =>
    item.uploaded
      ? [
          {
            type: "file",
            mediaType: item.uploaded.mediaType,
            filename: item.uploaded.name,
            url: item.uploaded.url,
          },
        ]
      : [],
  );

  return {
    items,
    parts,
    uploading: items.some((item) => item.uploaded === null),
    add,
    remove: drop,
    clear,
  };
}
