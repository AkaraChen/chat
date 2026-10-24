import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "../../../auth-client";
import { Spinner } from "../../spinner";

export function GeneralPanel({ name }: { name: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    queryClient.clear();
    await navigate({ to: "/" });
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-lg font-semibold tracking-[-0.01em] text-[#1C1C1E]">{name}</span>
        <span className="text-[13px] text-[#6E6E73]">Signed in</span>
      </div>
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        className="flex h-9 items-center gap-2 rounded-full bg-[#F3F3F5] px-4 text-sm font-medium text-[#1C1C1E] hover:bg-[#EAEAED] disabled:opacity-60"
      >
        {pending && <Spinner size={14} />}
        Sign out
      </button>
    </div>
  );
}
