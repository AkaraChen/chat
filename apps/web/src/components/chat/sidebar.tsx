import { GearSixIcon, NotePencilIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

type Thread = { id: string; title: string; updatedAt: Date | string };

const DAY = 24 * 60 * 60 * 1000;

function group(threads: Thread[], now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groups: { label: string; threads: Thread[] }[] = [
    { label: "Today", threads: [] },
    { label: "Yesterday", threads: [] },
    { label: "Earlier", threads: [] },
  ];
  for (const thread of threads) {
    const at = new Date(thread.updatedAt).getTime();
    groups[at >= start ? 0 : at >= start - DAY ? 1 : 2]!.threads.push(thread);
  }
  return groups.filter((g) => g.threads.length > 0);
}

export function Sidebar({
  threads,
  activeId,
  name,
  onSettings,
}: {
  threads: Thread[];
  activeId: string | undefined;
  name: string;
  onSettings: () => void;
}) {
  return (
    <aside className="flex h-svh w-[272px] shrink-0 flex-col bg-[#F7F7F8] px-3 pt-5 pb-3">
      <span className="px-3 text-[17px] font-semibold tracking-[-0.01em] text-[#1C1C1E]">
        The Chat
      </span>
      <Link
        to="/chat"
        search={{}}
        className="mt-5 flex h-10 items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-[#1C1C1E] hover:bg-[#EDEDF0]"
      >
        <NotePencilIcon size={18} />
        New chat
      </Link>
      <nav className="mt-5 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        {group(threads).map(({ label, threads }) => (
          <section key={label} className="flex flex-col gap-0.5">
            <h2 className="px-3 pb-1 text-xs font-medium text-[#9E9EA4]">{label}</h2>
            {threads.map((thread) => (
              <Link
                key={thread.id}
                to="/chat"
                search={{ thread: thread.id }}
                className={`truncate rounded-xl px-3 py-2 text-sm text-[#1C1C1E] ${
                  thread.id === activeId ? "bg-[#E8E8EC]" : "hover:bg-[#EDEDF0]"
                }`}
              >
                {thread.title}
              </Link>
            ))}
          </section>
        ))}
      </nav>
      <div className="mt-3 flex flex-col gap-0.5">
        <span className="truncate px-3 py-1 text-[13px] text-[#6E6E73]">{name}</span>
        <button
          type="button"
          onClick={onSettings}
          className="flex h-10 items-center gap-2.5 rounded-xl px-3 text-sm text-[#1C1C1E] hover:bg-[#EDEDF0]"
        >
          <GearSixIcon size={18} />
          Settings
        </button>
      </div>
    </aside>
  );
}
