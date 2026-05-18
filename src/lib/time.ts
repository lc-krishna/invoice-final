const TZ = "America/Chicago";

const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const friendlyFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  month: "short",
  day: "numeric",
});

const fullFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZoneName: "short",
});

/** True if the value is a Date that doesn't blow up DateTimeFormat. */
export function isValidDate(date: unknown): date is Date {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

/** Returns a YYYY-MM-DD string representing the date in America/Chicago, or null if invalid. */
export function toChicagoDateKey(date: Date): string | null {
  if (!isValidDate(date)) return null;
  const parts = dateFmt.formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}

export function chicagoTodayKey(): string {
  return toChicagoDateKey(new Date()) ?? "";
}

export function chicagoYesterdayKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return toChicagoDateKey(d) ?? "";
}

export function formatChicagoTime(date: Date): string {
  if (!isValidDate(date)) return "";
  return timeFmt.format(date);
}

export function formatChicagoFull(date: Date): string {
  if (!isValidDate(date)) return "";
  return fullFmt.format(date);
}

export function formatGroupLabel(dateKey: string): string {
  const today = chicagoTodayKey();
  const yesterday = chicagoYesterdayKey();
  if (dateKey === today) return "Today";
  if (dateKey === yesterday) return "Yesterday";
  // dateKey is YYYY-MM-DD; render as friendly
  const [y, m, d] = dateKey.split("-").map(Number);
  // Use UTC midday to avoid shifting around DST
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return friendlyFmt.format(date);
}

/**
 * Format a Date as ISO 8601 with America/Chicago offset, e.g.
 * 2025-04-22T10:15:30-05:00
 */
export function toChicagoIso(date: Date): string {
  if (!isValidDate(date)) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
  }).formatToParts(date);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const y = get("year");
  const mo = get("month");
  const d = get("day");
  let h = get("hour");
  if (h === "24") h = "00";
  const mi = get("minute");
  const s = get("second");
  const tzName = get("timeZoneName"); // e.g. "GMT-5"
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  let offset = "+00:00";
  if (match) {
    const sign = match[1];
    const oh = match[2].padStart(2, "0");
    const om = (match[3] ?? "00").padStart(2, "0");
    offset = `${sign}${oh}:${om}`;
  }
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${offset}`;
}
