// How long a stateless export link stays valid, measured from the moment it
// is minted. The same four choices are on the export dialog.
export const exportAccess = ["signed-in", "public"] as const;
export type ExportAccess = (typeof exportAccess)[number];

export const exportDurations = ["10m", "1h", "1d", "7d"] as const;
export type ExportDuration = (typeof exportDurations)[number];

export const exportDurationMs: Record<ExportDuration, number> = {
  "10m": 10 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export function exportExpiresAt(duration: ExportDuration, now: Date): Date {
  return new Date(now.getTime() + exportDurationMs[duration]);
}

/** The public path of a minted link. The origin is added by the browser. */
export function exportPath(token: string): string {
  return `/s/${token}`;
}
