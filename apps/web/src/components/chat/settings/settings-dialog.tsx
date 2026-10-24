import { XIcon } from "@phosphor-icons/react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@my-better-t-app/ui/components/dialog";

import { GeneralPanel } from "./general";
import { ProvidersPanel } from "./providers";

export type SettingsTab = "general" | "providers";

const tabs: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "providers", label: "Providers" },
];

export function SettingsDialog({
  tab,
  name,
  onTab,
  onClose,
}: {
  tab: SettingsTab | undefined;
  name: string;
  onTab: (tab: SettingsTab) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={tab !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[600px] max-h-[90svh] w-[780px] max-w-[94vw] rounded-3xl">
        <nav className="flex w-48 shrink-0 flex-col gap-0.5 bg-[#F7F7F8] px-3 pt-16">
          <DialogTitle className="sr-only">Settings</DialogTitle>
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => onTab(id)}
              className={`h-10 rounded-xl px-3 text-left text-sm font-medium text-[#1C1C1E] ${
                id === tab ? "bg-[#E8E8EC]" : "hover:bg-[#EDEDF0]"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="relative min-w-0 flex-1 overflow-y-auto px-10 pt-16 pb-10">
          <DialogClose
            aria-label="Close"
            className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full text-[#6E6E73] hover:bg-[#F3F3F5]"
          >
            <XIcon size={16} weight="bold" />
          </DialogClose>
          {tab === "general" && <GeneralPanel name={name} />}
          {tab === "providers" && <ProvidersPanel />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
