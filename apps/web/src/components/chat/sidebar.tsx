import { BooksIcon, GearSixIcon, PlusIcon, SidebarSimpleIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

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

export function roleName(role: string) {
  if (role === "admin") return "Admin";
  if (role === "user") return "User";
  return "Visitor";
}

export function Sidebar({
  threads,
  activeId,
  name,
  role,
  onSettings,
}: {
  threads: Thread[];
  activeId: string | undefined;
  name: string;
  role: string;
  onSettings: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const initial = name.trim().slice(0, 1).toUpperCase() || "A";
  return (
    <aside
      className={`flex h-full shrink-0 flex-col py-3 ${collapsed ? "w-[72px] items-center px-2" : "w-60 px-3"}`}
    >
      <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between px-1"}`}>
        {collapsed ? null : (
          <span
            aria-label="The Chat"
            className="flex items-baseline gap-1 font-['Inter_Variable'] text-[18px] leading-[22px] tracking-[-0.045em] [font-synthesis:none]"
          >
            <span className="font-semibold text-[#1C1C1E]">The</span><span className="font-normal text-[#6E6E73]">Chat</span>
          </span>
        )}
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((value) => !value)}
          className="flex size-8 items-center justify-center rounded-lg text-[#6E6E73] hover:bg-white"
        >
          <SidebarSimpleIcon size={18} />
        </button>
      </div>
      <Link
        to="/chat"
        search={{}}
        aria-label="New chat"
        className={`mt-4 flex items-center justify-center bg-[#1A73E8] font-medium text-white ${
          collapsed ? "size-10 rounded-xl" : "h-10 gap-2 rounded-xl px-3 text-sm"
        }`}
      >
        <PlusIcon size={16} weight="bold" />
        {collapsed ? null : "New chat"}
      </Link>
      <button
        type="button"
        className={`mt-2 flex items-center text-sm text-[#6E6E73] hover:bg-white ${
          collapsed ? "size-10 justify-center rounded-xl" : "h-10 gap-2.5 rounded-xl px-3"
        }`}
      >
        <BooksIcon size={18} className="shrink-0 text-[#6E6E73]" />
        {collapsed ? <span className="sr-only">Library</span> : "Library"}
      </button>
      {collapsed ? null : (
        <nav className="mt-4 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
          {group(threads).map(({ label, threads }) => (
            <section key={label} className="flex flex-col gap-0.5">
              <h2 className="px-3 pb-1 text-xs font-medium text-[#9E9EA4]">{label}</h2>
              {threads.map((thread) => (
                <Link
                  key={thread.id}
                  to="/chat"
                  search={{ thread: thread.id }}
                  className={`truncate rounded-xl px-3 py-2 text-sm text-[#1C1C1E] ${
                    thread.id === activeId ? "bg-[#E8E8EC]" : "hover:bg-white"
                  }`}
                >
                  {thread.title}
                </Link>
              ))}
            </section>
          ))}
        </nav>
      )}
      <div className={`mt-auto flex items-center gap-2 ${collapsed ? "flex-col pt-3" : "px-1 pt-3"}`}>
        <span
          aria-label={name}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#E8E8EC] text-[13px] font-medium text-[#6E6E73]"
        >
          {initial}
        </span>
        {collapsed ? null : (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-[#1C1C1E]">{name}</span>
            <span className="block text-xs text-[#6E6E73]">{roleName(role)}</span>
          </span>
        )}
        <button
          type="button"
          aria-label="Settings"
          onClick={onSettings}
          className="flex size-8 items-center justify-center rounded-lg text-[#6E6E73] hover:bg-white"
        >
          <GearSixIcon size={18} />
        </button>
      </div>
    </aside>
  );
}
