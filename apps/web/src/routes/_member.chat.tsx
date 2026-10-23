import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

import { findProvider } from "../components/providers";

export const Route = createFileRoute("/_member/chat")({
  component: Chat,
});

function Chat() {
  const connections = useQuery(orpc.connections.list.queryOptions());
  const connected = connections.data ?? [];
  return (
    <main className="flex h-svh flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-sm font-medium text-[#1C1C1E]">The Chat</span>
        <Link to="/connect" className="text-[13px] text-[#0969DA]">
          {connected.length === 0 ? "Connect a provider" : "Add a provider"}
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center">
        {connected.length === 0 ? (
          <p className="text-[15px] text-[#6E6E73]">Connect a provider to start chatting.</p>
        ) : (
          <ul className="flex flex-col items-center gap-2">
            {connected.map((connection) => (
              <li key={connection.id} className="text-[15px] text-[#1C1C1E]">
                {findProvider(connection.type)?.name ?? connection.type} · {connection.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
