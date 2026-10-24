import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { orpc } from "@/utils/orpc";

/**
 * The models the proxy serves and the one picked for this account. With no
 * pick yet, the first model is taken so sending is never a dead end.
 */
export function useModelChoice() {
  const queryClient = useQueryClient();
  // The proxy can be down; the picker says so inline instead of a toast.
  const models = useQuery(orpc.models.list.queryOptions({ retry: false, meta: { quiet: true } }));
  const select = useMutation(
    orpc.models.select.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.models.list.key() }),
    }),
  );

  const data = models.data;
  const first = data?.connections.find((c) => c.models.length > 0);
  const missing = data !== undefined && data.choice === null && first !== undefined;
  useEffect(() => {
    if (missing && first && !select.isPending) {
      select.mutate({ connectionId: first.connectionId, modelId: first.models[0]!.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing, first?.connectionId]);

  const choice = data?.choice ?? null;
  const connection = data?.connections.find((c) => c.connectionId === choice?.connectionId);
  const model = connection?.models.find((m) => m.id === choice?.modelId);

  return {
    models,
    connections: data?.connections ?? [],
    choice,
    connection,
    model,
    /** A model is picked and still served. */
    ready: choice?.available === true,
    select: (connectionId: string, modelId: string) => select.mutate({ connectionId, modelId }),
  };
}
