import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@my-better-t-app/ui/components/dropdown-menu";

import { ConnectionMark } from "../brand-mark";
import { findProvider } from "../providers";
import { useModelChoice } from "./use-model-choice";

function connectionName(c: { type: string; label: string; name?: string }) {
  return c.name ?? findProvider(c.type)?.name ?? c.label;
}

// Past this many models the picker gets a search field. OpenRouter alone
// brings hundreds.
const SEARCH_FROM = 12;

function matches(query: string, ...texts: string[]) {
  const q = query.trim().toLowerCase();
  return q === "" || texts.some((text) => text.toLowerCase().includes(q));
}

export function ModelPicker({ onConnect }: { onConnect: () => void }) {
  const { t } = useTranslation();
  const { models, connections, choice, connection, model, select } = useModelChoice();
  const [query, setQuery] = useState("");

  if (models.isError) {
    return (
      <span className="flex h-9 items-center rounded-full bg-[#F7F7F9] px-3 text-sm text-[#6E6E73]">
        {t("picker.unavailableAll")}
      </span>
    );
  }
  if (models.isPending) {
    return (
      <span className="flex h-9 items-center rounded-full bg-[#F7F7F9] px-3 text-sm text-[#6E6E73]">
        {t("picker.choose")}
      </span>
    );
  }
  if (connections.length === 0) {
    return (
      <button
        type="button"
        onClick={onConnect}
        className="flex h-9 items-center rounded-full bg-[#F7F7F9] px-3 text-sm font-medium text-[#1A73E8]"
      >
        {t("picker.connect")}
      </button>
    );
  }

  const unavailable = choice !== null && !choice.available;
  const total = connections.reduce((sum, c) => sum + c.models.length, 0);
  const searchable = total > SEARCH_FROM;
  const shown = connections
    .map((c) => {
      const group = connectionName(c);
      return { ...c, models: c.models.filter((m) => matches(query, m.name, m.id, group)) };
    })
    .filter((c) => c.models.length > 0);
  return (
    <DropdownMenu onOpenChange={(open) => !open && setQuery("")}>
      <DropdownMenuTrigger
        className={`flex h-9 items-center gap-2 rounded-full bg-[#F7F7F9] px-3 text-sm font-medium outline-none hover:bg-[#E8E8EC] ${
          unavailable ? "text-[#C2410C]" : "text-[#1C1C1E]"
        }`}
      >
        {connection && !unavailable && (
          <ConnectionMark type={connection.type} label={connection.label} size={16} />
        )}
        <span>{unavailable ? t("picker.unavailable") : (model?.name ?? t("picker.choose"))}</span>
        <CaretDownIcon size={12} weight="bold" className="text-[#9E9EA4]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[min(70vh,var(--available-height))] w-80 rounded-xl p-1.5"
      >
        {searchable ? (
          <div className="sticky -top-1.5 z-10 -mx-1.5 -mt-1.5 mb-1 bg-white px-1.5 pt-1.5 pb-1">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              // Letters go to the field, not to the menu's type-to-jump.
              // Arrows and Escape still move through and close the menu.
              onKeyDown={(event) => {
                if (event.key.length === 1 || event.key === "Backspace") event.stopPropagation();
              }}
              placeholder={t("picker.search", { count: total })}
              aria-label={t("picker.searchLabel")}
              className="h-9 w-full rounded-lg bg-[#F7F7F9] px-3 text-sm text-[#1C1C1E] outline-none placeholder:text-[#9E9EA4]"
            />
          </div>
        ) : null}
        {shown.length === 0 ? (
          <p className="px-2.5 py-2 text-sm text-[#6E6E73]">{t("picker.noMatch")}</p>
        ) : null}
        {shown.map((c) => (
          <DropdownMenuGroup key={c.connectionId} className="pb-1.5 last:pb-0">
            <DropdownMenuLabel className="flex items-center gap-2 px-2.5 pt-2 pb-1.5 text-[13px] text-[#6E6E73]">
              <ConnectionMark type={c.type} label={c.label} size={16} />
              {connectionName(c)}
            </DropdownMenuLabel>
            {c.models.map((m) => {
              const active =
                choice?.connectionId === c.connectionId && choice.modelId === m.id && !unavailable;
              return (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() => select(c.connectionId, m.id)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-[#1C1C1E] hover:bg-[#F7F7F9]"
                >
                  <span className="flex-1 truncate">{m.name}</span>
                  {active && <CheckIcon size={14} weight="bold" className="text-[#1A73E8]" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
