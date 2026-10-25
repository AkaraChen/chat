import {
  BooksIcon,
  DotsThreeVerticalIcon,
  GearSixIcon,
  PlusIcon,
  SidebarSimpleIcon,
} from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@my-better-t-app/ui/components/dropdown-menu";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Thread = { id: string; title: string; updatedAt: Date | string };

const DAY = 24 * 60 * 60 * 1000;
// Read a thread ahead only when the pointer rests on it, not when it passes over.
const HOVER_INTENT_MS = 100;

function group(threads: Thread[], now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groups: { label: "today" | "yesterday" | "earlier"; threads: Thread[] }[] = [
    { label: "today", threads: [] },
    { label: "yesterday", threads: [] },
    { label: "earlier", threads: [] },
  ];
  for (const thread of threads) {
    const at = new Date(thread.updatedAt).getTime();
    groups[at >= start ? 0 : at >= start - DAY ? 1 : 2]!.threads.push(thread);
  }
  return groups.filter((g) => g.threads.length > 0);
}

export function roleKey(role: string) {
  if (role === "admin") return "role.admin";
  if (role === "user") return "role.user";
  return "role.visitor";
}

type SidebarProps = {
  threads: Thread[];
  activeId: string | undefined;
  name: string;
  role: string;
  onSettings: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** A thread is about to be opened: hovered or focused. */
  onPrefetch?: (id: string) => void;
};

/**
 * The sidebar folds to a rail of icons. The width moves (ease-in-out: it is
 * on-screen movement), and the two layouts cross-fade inside it: the one
 * leaving fades fast, the one arriving a beat later, so they never read as
 * two things at once. Width is a layout property, but nothing else can make
 * the chat beside it grow; it is short and runs only on a click. Reduced
 * motion drops the movement and keeps the fade.
 */
export function Sidebar(props: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const toggles = useRef<Record<"open" | "rail", HTMLButtonElement | null>>({
    open: null,
    rail: null,
  });
  const moveFocus = useRef(false);

  // The toggle that was clicked is now in the hidden layout; its twin takes focus.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    toggles.current[collapsed ? "rail" : "open"]?.focus();
  }, [collapsed]);

  function toggle() {
    moveFocus.current = document.activeElement === toggles.current[collapsed ? "rail" : "open"];
    setCollapsed((value) => !value);
  }

  return (
    <aside
      className={`relative h-full shrink-0 overflow-hidden transition-[width] duration-[240ms] ease-in-out motion-reduce:transition-none ${
        collapsed ? "w-[72px]" : "w-60"
      }`}
    >
      {([false, true] as const).map((rail) => {
        const shown = rail === collapsed;
        return (
          <div
            key={rail ? "rail" : "open"}
            inert={!shown}
            aria-hidden={!shown}
            className={`absolute inset-y-0 left-0 transition-opacity ease-out ${
              rail ? "w-[72px]" : "w-60"
            } ${shown ? "opacity-100 delay-[60ms] duration-[160ms]" : "opacity-0 duration-[120ms]"}`}
          >
            <SidebarLayer
              {...props}
              collapsed={rail}
              toggleRef={(el) => {
                toggles.current[rail ? "rail" : "open"] = el;
              }}
              onToggle={toggle}
            />
          </div>
        );
      })}
    </aside>
  );
}

function SidebarLayer({
  threads,
  activeId,
  name,
  role,
  onSettings,
  onRename,
  onDelete,
  onPrefetch,
  collapsed,
  toggleRef,
  onToggle,
}: SidebarProps & {
  collapsed: boolean;
  toggleRef: (el: HTMLButtonElement | null) => void;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const initial = name.trim().slice(0, 1).toUpperCase() || "A";
  return (
    <div className={`flex h-full flex-col py-3 ${collapsed ? "items-center px-2" : "px-3"}`}>
      <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between px-1"}`}>
        {collapsed ? null : (
          <span
            aria-label="The Chat"
            className="flex items-baseline gap-1 font-['Inter_Variable'] text-[18px] leading-[22px] tracking-[-0.045em] [font-synthesis:none]"
          >
            <span className="font-semibold text-ink">The</span>
            <span className="font-normal text-ink-secondary">Chat</span>
          </span>
        )}
        <button
          ref={toggleRef}
          type="button"
          aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          onClick={onToggle}
          className="flex size-8 items-center justify-center rounded-lg text-ink-secondary hover:bg-paper"
        >
          <SidebarSimpleIcon size={18} />
        </button>
      </div>
      <Link
        to="/chat"
        search={{}}
        aria-label={t("sidebar.newChat")}
        className={`mt-4 flex items-center justify-center bg-accent font-medium text-on-accent ${
          collapsed ? "size-10 rounded-xl" : "h-10 gap-2 rounded-xl px-3 text-sm"
        }`}
      >
        <PlusIcon size={16} weight="bold" />
        {collapsed ? null : t("sidebar.newChat")}
      </Link>
      <button
        type="button"
        className={`mt-2 flex items-center text-sm text-ink-secondary hover:bg-paper ${
          collapsed ? "size-10 justify-center rounded-xl" : "h-10 gap-2.5 rounded-xl px-3"
        }`}
      >
        <BooksIcon size={18} className="shrink-0 text-ink-secondary" />
        {collapsed ? <span className="sr-only">{t("sidebar.library")}</span> : t("sidebar.library")}
      </button>
      {collapsed ? null : (
        <nav className="mt-4 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
          {group(threads).map(({ label, threads }) => (
            <section key={label} className="flex flex-col gap-0.5">
              <h2 className="px-3 pb-1 text-xs font-medium text-ink-tertiary">
                {t(`sidebar.${label}`)}
              </h2>
              {threads.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  active={thread.id === activeId}
                  onRename={onRename}
                  onDelete={onDelete}
                  onPrefetch={onPrefetch}
                />
              ))}
            </section>
          ))}
        </nav>
      )}
      <div
        className={`mt-auto flex items-center gap-2 ${collapsed ? "flex-col pt-3" : "px-1 pt-3"}`}
      >
        <span
          role="img"
          aria-label={name}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-selected text-[13px] font-medium text-ink-secondary"
        >
          {initial}
        </span>
        {collapsed ? null : (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">{name}</span>
            <span className="block text-xs text-ink-secondary">{t(roleKey(role))}</span>
          </span>
        )}
        <button
          type="button"
          aria-label={t("sidebar.settings")}
          onClick={onSettings}
          className="flex size-8 items-center justify-center rounded-lg text-ink-secondary hover:bg-paper"
        >
          <GearSixIcon size={18} />
        </button>
      </div>
    </div>
  );
}

function ThreadRow({
  thread,
  active,
  onRename,
  onDelete,
  onPrefetch,
}: {
  thread: Thread;
  active: boolean;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPrefetch?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(thread.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipCommit = useRef(false);
  const hover = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(hover.current), []);
  const filled = active || menuOpen || editing;

  useEffect(() => {
    if (!editing) setDraft(thread.title);
  }, [editing, thread.title]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function cancel() {
    skipCommit.current = true;
    setDraft(thread.title);
    setEditing(false);
  }

  async function commit() {
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    const title = draft.trim();
    setEditing(false);
    if (!title || title === thread.title) {
      setDraft(thread.title);
      return;
    }
    try {
      await onRename(thread.id, title);
    } catch {
      setDraft(thread.title);
    }
  }

  return (
    <div
      className={`group flex h-8 items-center rounded-[8px] pr-1 pl-2.5 ${
        filled ? "bg-selected" : "hover:bg-selected"
      }`}
    >
      {editing ? (
        <input
          ref={inputRef}
          aria-label={t("sidebar.chatName")}
          value={draft}
          maxLength={80}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[13px] font-medium leading-[18px] text-ink outline-none"
        />
      ) : (
        <Link
          to="/chat"
          search={{ thread: thread.id }}
          onMouseEnter={() => {
            clearTimeout(hover.current);
            hover.current = setTimeout(() => onPrefetch?.(thread.id), HOVER_INTENT_MS);
          }}
          onMouseLeave={() => clearTimeout(hover.current)}
          onFocus={() => onPrefetch?.(thread.id)}
          className="flex h-full min-w-0 flex-1 items-center"
        >
          <span className="truncate text-[13px] font-medium leading-[18px] text-ink">
            {thread.title}
          </span>
        </Link>
      )}
      {editing ? null : (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            aria-label={t("sidebar.actions", { title: thread.title })}
            className={`ml-2 flex size-5 shrink-0 items-center justify-center rounded-[6px] text-ink-secondary outline-none ${
              menuOpen
                ? "bg-paper"
                : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
            }`}
          >
            <DotsThreeVerticalIcon size={16} weight="bold" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            finalFocus={false}
            className="flex w-[216px] flex-col gap-0.5 rounded-[12px] border border-line-quiet bg-paper p-1.5 shadow-[var(--elevation-menu)] ring-0"
          >
            <DropdownMenuItem
              onClick={() => {
                setDraft(thread.title);
                setEditing(true);
              }}
              className="h-8 rounded-[8px] px-2.5 text-[13px] font-medium text-ink focus:bg-recessed focus:text-ink"
            >
              {t("sidebar.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void onDelete(thread.id)}
              className="h-8 rounded-[8px] px-2.5 text-[13px] font-medium text-remove focus:bg-recessed focus:text-remove"
            >
              {t("sidebar.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
