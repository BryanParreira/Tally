const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

export function daysBetween(fromKeyStr: string, toKeyStr: string): number {
  const ms = fromKey(toKeyStr).getTime() - fromKey(fromKeyStr).getTime();
  return Math.round(ms / 86_400_000);
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** 870 -> "2:30 PM" */
export function formatTime(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${mm} ${suffix}`;
}

/** 95 -> "1 h 35 min" */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function formatDay(key: string, today: string): string {
  const diff = daysBetween(today, key);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return fromKey(key).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** "Due today", "Due tomorrow", "Due Mon, Oct 19", "Overdue" */
export function dueLabel(key: string, today: string): string {
  const diff = daysBetween(today, key);
  if (diff < 0) return "Overdue";
  if (diff <= 1) return `Due ${formatDay(key, today).toLowerCase()}`;
  return `Due ${formatDay(key, today)}`;
}

export function formatLongDate(key: string): string {
  return fromKey(key).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export function weekdayIndex(word: string): number {
  const w = word.toLowerCase();
  return WEEKDAYS.findIndex((day) => day === w || day.slice(0, 3) === w || (w.length >= 3 && day.startsWith(w)));
}

export function monthIndex(word: string): number {
  const w = word.toLowerCase();
  return MONTHS.findIndex((m) => m === w || (w.length >= 3 && m.startsWith(w)));
}

/** The next date (today included) that falls on the given weekday. */
export function nextWeekday(today: string, weekday: number, skipToday = false): string {
  const current = fromKey(today).getDay();
  let ahead = (weekday - current + 7) % 7;
  if (ahead === 0 && skipToday) ahead = 7;
  return addDays(today, ahead);
}

/**
 * Resolve phrases like "friday", "tomorrow", "oct 22", "22 october", "10/22", "eod".
 * Returns null when the phrase is not a date.
 */
export function resolveDayPhrase(phrase: string, today: string): string | null {
  const p = phrase.trim().toLowerCase().replace(/[.,]$/, "");
  if (!p) return null;
  const eodDay = p.match(/^(?:eod|end of (?:the )?day)\s+(?:on\s+)?(.+)$/);
  if (eodDay) return resolveDayPhrase(eodDay[1], today);
  if (p === "today" || p === "tonight" || p === "eod" || p === "end of day" || p === "end of the day") return today;
  if (p === "tomorrow" || p === "tmrw" || p === "tmr") return addDays(today, 1);
  if (p === "next week") return addDays(today, 7);
  if (p === "end of week" || p === "end of the week" || p === "eow") return nextWeekday(today, 5);

  const next = p.match(/^next\s+([a-z]+)$/);
  if (next) {
    const wd = weekdayIndex(next[1]);
    if (wd >= 0) return nextWeekday(today, wd, true);
  }

  const wd = weekdayIndex(p);
  if (wd >= 0 && /^[a-z]+$/.test(p)) return nextWeekday(today, wd);

  const year = fromKey(today).getFullYear();
  const pick = (month: number, day: number) => {
    if (month < 0 || month > 11 || day < 1 || day > 31) return null;
    let key = dateKey(new Date(year, month, day));
    // A date that already passed this year most likely means next year.
    if (daysBetween(today, key) < -30) key = dateKey(new Date(year + 1, month, day));
    return key;
  };

  const monthFirst = p.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/);
  if (monthFirst && monthIndex(monthFirst[1]) >= 0) return pick(monthIndex(monthFirst[1]), Number(monthFirst[2]));

  const dayFirst = p.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)$/);
  if (dayFirst && monthIndex(dayFirst[2]) >= 0) return pick(monthIndex(dayFirst[2]), Number(dayFirst[1]));

  const numeric = p.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (numeric) return pick(Number(numeric[1]) - 1, Number(numeric[2]));

  return null;
}

export const DAY_PHRASE =
  "(?:(?:eod|end of (?:the )?day)\\s+(?:on\\s+)?(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday|rsday)?|today|tonight|tomorrow|tmrw|tmr|eod|end of (?:the )?day|end of (?:the )?week|eow|next week|next\\s+[a-z]+|" +
  "(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday|rsday)?|" +
  "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?|" +
  "\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|" +
  "\\d{1,2}\\/\\d{1,2})";
