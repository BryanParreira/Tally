import { addDays } from "./date";
import { parseICS } from "./ics";
import { calendarFetch } from "./native";
import { today, useStore } from "./store";
import type { CalendarSource, CalEvent } from "./types";

/** Keep what's relevant: recent history, the coming year, and series still running. */
function relevant(events: CalEvent[]): CalEvent[] {
  const from = addDays(today(), -30);
  const to = addDays(today(), 400);
  return events.filter((e) => {
    const start = e.start.slice(0, 10);
    if (e.rrule) return start <= to && (!e.rrule.until || e.rrule.until >= from);
    return e.end.slice(0, 10) >= from && start <= to;
  });
}

export async function syncCalendar(cal: CalendarSource): Promise<number> {
  const set = useStore.getState().setCalendarEvents;
  try {
    const events = relevant(parseICS(await calendarFetch(cal.url), cal.id));
    set(cal.id, events);
    return events.length;
  } catch (err) {
    set(cal.id, null, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export async function syncAllCalendars(): Promise<void> {
  await Promise.allSettled(useStore.getState().calendars.map(syncCalendar));
}
