import { describe, expect, test } from "bun:test";

import { formatTime, serverTimeZone, timePrompt, timeTool } from "./time";

const opts = { toolCallId: "t", messages: [] } as never;

describe("time", () => {
  test("formats in the server's time zone, with weekday and offset", () => {
    const date = new Date(2026, 9, 28, 9, 5);
    expect(formatTime(date)).toMatch(
      new RegExp(`^Wednesday, 2026-10-28 09:05 [+-]\\d\\d:\\d\\d \\(${serverTimeZone()}\\)$`),
    );
  });

  test("the prompt names the start and points at the tool", () => {
    const date = new Date(2026, 0, 1, 0, 0);
    expect(timePrompt(date)).toBe(
      `This conversation started at ${formatTime(date)}. For the time now, call get_current_time.`,
    );
  });

  test("get_current_time reads the clock when called", async () => {
    let now = new Date(2026, 9, 28, 14, 3);
    const time = timeTool(() => now);
    now = new Date(2026, 9, 28, 15, 30);
    const result = await time.execute!({}, opts);
    expect(result).toEqual({
      detail: { time: "15:30" },
      iso: now.toISOString(),
      local: formatTime(now),
      timeZone: serverTimeZone(),
    });
  });
});
