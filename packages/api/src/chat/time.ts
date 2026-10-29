import { tool, type Tool } from "ai";
import { z } from "zod";

/** The server's own time zone: the operating system's, as the runtime reads it. */
export function serverTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const pad = (n: number) => String(n).padStart(2, "0");

function offsetOf(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** `Wednesday, 2026-10-28 14:03 +08:00 (Asia/Shanghai)`, in the server's time zone. */
export function formatTime(date: Date): string {
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${weekday}, ${day} ${clock} ${offsetOf(date)} (${serverTimeZone()})`;
}

/**
 * The system message a conversation starts with. It names when the thread
 * began, which does not change, so the prompt stays the same turn to turn.
 */
export function timePrompt(startedAt: Date): string {
  return `This conversation started at ${formatTime(startedAt)}. For the time now, call get_current_time.`;
}

/** `get_current_time`: the server's clock, read when the model calls it. */
export function timeTool(now: () => Date = () => new Date()): Tool {
  return tool({
    description:
      "Get the current date and time from the server's clock, with its time zone. Use it whenever the answer depends on today's date or the time now.",
    inputSchema: z.object({}),
    async execute() {
      const date = now();
      return {
        detail: { time: `${pad(date.getHours())}:${pad(date.getMinutes())}` },
        iso: date.toISOString(),
        local: formatTime(date),
        timeZone: serverTimeZone(),
      };
    },
  });
}
