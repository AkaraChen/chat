import { MinusCircleIcon, PlusIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

type Item = { id: string; name: string };
export type CatalogEntry = { id: string; name: string; models: Item[] };

/**
 * The models added to an OpenRouter or Custom connection, and a way to add
 * more from models.dev. The proxy takes a moment to pick up a change, so the
 * list shows what the server returned and the picker refreshes shortly after.
 */
export function ModelsBlock({
  connectionId,
  listed,
  entry,
}: {
  connectionId: string;
  listed: Item[];
  entry: CatalogEntry | null;
}) {
  const queryClient = useQueryClient();
  const [local, setLocal] = useState<Item[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");
  const items = local ?? listed;

  const settle = (models: { name: string; display_name: string }[]) => {
    setLocal(models.map((m) => ({ id: m.name, name: m.display_name || m.name })));
    setTimeout(() => queryClient.invalidateQueries({ queryKey: orpc.models.list.key() }), 1500);
  };
  const create = useMutation(orpc.models.create.mutationOptions({ onSuccess: settle }));
  const remove = useMutation(orpc.models.delete.mutationOptions({ onSuccess: settle }));

  const have = new Set(items.map((m) => m.id));
  const choices = (entry?.models ?? []).filter(
    (m) =>
      !have.has(m.id) && `${m.name} ${m.id}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-1 pb-3 pl-11">
      {items.map((model) => (
        <div key={model.id} className="flex h-9 items-center gap-2">
          <span className="flex-1 truncate text-sm text-[#1C1C1E]">{model.name}</span>
          <button
            type="button"
            aria-label={`Remove ${model.name}`}
            disabled={remove.isPending}
            onClick={() => remove.mutate({ connectionId, modelId: model.id })}
            className="text-[#9E9EA4] hover:text-[#C2410C] disabled:opacity-50"
          >
            <MinusCircleIcon size={18} />
          </button>
        </div>
      ))}
      {items.length === 0 && !adding && (
        <p className="py-1 text-[13px] text-[#6E6E73]">Add a model to start chatting with it.</p>
      )}
      {adding ? (
        <div className="mt-1 flex flex-col gap-2">
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search models"
            aria-label="Search models"
            autoFocus
            className="h-10 rounded-xl bg-[#F3F3F5] px-3.5 text-sm text-[#1C1C1E] outline-none placeholder:text-[#9E9EA4] focus:ring-2 focus:ring-[#1A73E8]/40"
          />
          <ul className="max-h-56 overflow-y-auto">
            {choices.map((model) => (
              <li key={model.id}>
                <button
                  type="button"
                  disabled={create.isPending}
                  onClick={() => create.mutate({ connectionId, modelId: model.id })}
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[#1C1C1E] hover:bg-[#F3F3F5] disabled:opacity-60"
                >
                  <PlusIcon size={14} weight="bold" className="shrink-0 text-[#1A73E8]" />
                  <span className="truncate">{model.name}</span>
                </button>
              </li>
            ))}
            {choices.length === 0 && (
              <li className="px-2 py-2 text-[13px] text-[#6E6E73]">
                {entry ? "No more models match." : "models.dev is unavailable right now."}
              </li>
            )}
          </ul>
          {(create.isError || remove.isError) && (
            <p className="text-[13px] text-[#C2410C]">Couldn't update the models. Try again.</p>
          )}
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setFilter("");
            }}
            className="self-start text-[13px] font-medium text-[#1A73E8]"
          >
            Done
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-0.5 flex items-center gap-1.5 self-start text-[13px] font-medium text-[#1A73E8]"
        >
          <PlusIcon size={13} weight="bold" />
          Add a model
        </button>
      )}
    </div>
  );
}
