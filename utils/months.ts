const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export function getMonthFromTimestamp(
  ts: any,
  { tz = "Asia/Kolkata", long = false } = {}
) {
  const d = new Date(ts);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
  }).formatToParts(d);
  let yearStr = "0",
    monthStr = "0";
  for (const p of parts) {
    if (p.type === "year") yearStr = p.value;
    if (p.type === "month") monthStr = p.value;
  }
  const year = Number(yearStr);
  const month = Number(monthStr);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const monthLabel = long ? MONTH_LABELS[month - 1] : MONTH_LABELS[month - 1];
  return { year, month, monthKey, monthLabel };
}

export function groupByMonthIST(timestamps: any, longNames = false) {
  const map = new Map();
  for (const ts of timestamps) {
    const { monthKey, monthLabel } = getMonthFromTimestamp(ts, {
      long: longNames,
    });
    const row = map.get(monthKey);
    if (row) row.count += 1;
    else map.set(monthKey, { monthKey, monthLabel, count: 1 });
  }
  return Array.from(map.values()).sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey)
  );
}

export function timeAgo(fromIso: string, to: Date = new Date()): string {
  const then = new Date(fromIso).getTime();
  const now = to.getTime();
  const diffMs = Math.max(0, now - then);
  const s = Math.floor(diffMs / 1000);
  if (s < 5) return "just now";
  if (s < 60) return s + "s ago";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  if (d < 30) return d + "d ago";
  const mo = Math.floor(d / 30);
  if (mo < 12) return mo + "months ago";
  const y = Math.floor(mo / 12);
  return y + "years ago";
}
