import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

import { GitHubMark } from "../../github-mark";
import { KeyForm } from "./key-form";
import { RowButton } from "./row";

/** The token for pull request reviews. Set or cleared; never read back. */
export function GithubBlock() {
  const queryClient = useQueryClient();
  const status = useQuery(orpc.github.get.queryOptions({ meta: { quiet: true } }));
  const [editing, setEditing] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.github.get.key() });
  const save = useMutation(
    orpc.github.save.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setEditing(false);
      },
    }),
  );
  const clear = useMutation(orpc.github.clear.mutationOptions({ onSuccess: refresh }));
  const set = status.data?.set === true;

  return (
    <div className="flex flex-col">
      <div className="flex min-h-12 items-center gap-3.5">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#1C1C1E]">
          <GitHubMark size={15} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-medium text-[#1C1C1E]">GitHub</span>
          <span className="text-[13px] text-[#6E6E73]">
            {set ? "Token saved" : "A token lets the model review pull requests"}
          </span>
        </div>
        {status.isSuccess && !editing && (
          <>
            {set && (
              <RowButton onClick={() => clear.mutate({})} disabled={clear.isPending}>
                Remove
              </RowButton>
            )}
            <RowButton onClick={() => setEditing(true)} tone={set ? "plain" : "primary"}>
              {set ? "Replace" : "Add token"}
            </RowButton>
          </>
        )}
      </div>
      {editing && (
        <KeyForm
          label="GitHub token"
          placeholder="ghp_…"
          submitLabel="Save"
          pending={save.isPending}
          error={save.isError ? "Couldn't save the token. Try again." : null}
          help={{
            href: "https://github.com/settings/personal-access-tokens/new",
            text: "Create a token with read access to pull requests ↗",
          }}
          onSubmit={(token) => save.mutate({ token })}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}
