import { addDays, fromKey } from "./date";

export type Repeat = "daily" | "weekdays" | "weekly";

export const REPEAT_LABEL: Record<Repeat, string> = { daily: "Every day", weekdays: "Every weekday", weekly: "Every week" };

const isWeekend = (key: string) => [0, 6].includes(fromKey(key).getDay());

/**
 * The day a repeating task comes back after it is finished. Always after today,
 * so finishing something late never plants a copy in the past.
 */
export function nextOccurrence(date: string, repeat: Repeat, today: string): string {
  if (repeat === "weekly") {
    let next = addDays(date, 7);
    while (next <= today) next = addDays(next, 7);
    return next;
  }
  let next = addDays(date > today ? date : today, 1);
  if (repeat === "weekdays") while (isWeekend(next)) next = addDays(next, 1);
  return next;
}
