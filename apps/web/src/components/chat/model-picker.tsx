import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
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

function connectionName(type: string, label: string) {
  return findProvider(type)?.name ?? label;
}

export function ModelPicker({ onConnect }: { onConnect: () => void }) {
  const { models, connections, choice, connection, model, select } = useModelChoice();

  if (models.isError) {
    return (
      <span className="flex h-9 items-center rounded-full bg-[#F7F7F9] px-3 text-sm text-[#6E6E73]">
        Models are unavailable right now
      </span>
    );
  }
  if (models.isPending) {
    return (
      <span className="flex h-9 items-center rounded-full bg-[#F7F7F9] px-3 text-sm text-[#6E6E73]">
        Choose a model
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
        Connect a provider
      </button>
    );
  }

  const unavailable = choice !== null && !choice.available;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`flex h-9 items-center gap-2 rounded-full bg-[#F7F7F9] px-3 text-sm font-medium outline-none hover:bg-[#E8E8EC] ${
          unavailable ? "text-[#C2410C]" : "text-[#1C1C1E]"
        }`}
      >
        {connection && !unavailable && (
          <ConnectionMark type={connection.type} label={connection.label} size={16} />
        )}
        <span>{unavailable ? "Model unavailable" : (model?.name ?? "Choose a model")}</span>
        <CaretDownIcon size={12} weight="bold" className="text-[#9E9EA4]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 rounded-xl p-1.5">
        {connections
          .filter((c) => c.models.length > 0)
          .map((c) => (
            <DropdownMenuGroup key={c.connectionId} className="pb-1.5 last:pb-0">
              <DropdownMenuLabel className="flex items-center gap-2 px-2.5 pt-2 pb-1.5 text-[13px] text-[#6E6E73]">
                <ConnectionMark type={c.type} label={c.label} size={16} />
                {connectionName(c.type, c.label)}
              </DropdownMenuLabel>
              {c.models.map((m) => {
                const active =
                  choice?.connectionId === c.connectionId &&
                  choice.modelId === m.id &&
                  !unavailable;
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
