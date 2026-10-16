import { eventsOn } from "../../lib/ics";
import { planFor, LOCAL_CALENDAR } from "../../lib/store";
import type { AppData, CalendarSource } from "../../lib/types";

export const TASKS_CALENDAR = "tasks";
export const CATEGORY_COLOR = { study: "var(--study)", work: "var(--work)", life: "var(--life)" } as const;

/** One thing on the calendar: a calendar event or a task from Kindred's plan. */
export interface CalItem {
  key: string;
  kind: "event" | "task";
  date: string;
  start: number;
  end: number;
  allDay: boolean;
  title: string;
  color: string;
  calendarId: string;
  location?: string;
  eventUid?: string;
  taskId?: string;
  done?: boolean;
  /** Flexible task placed by the planner rather than pinned by the user. */
  planned?: boolean;
  /** Can be moved and resized here (own events and tasks). */
  editable: boolean;
}

type State = Pick<AppData, "tasks" | "settings" | "focus" | "events" | "calendars">;

export function allCalendars(calendars: CalendarSource[]): CalendarSource[] {
  return [LOCAL_CALENDAR, ...calendars];
}

export function itemsForDay(state: State, date: string, now: Date): CalItem[] {
  const hidden = new Set(state.settings.hiddenCalendars);
  const cals = new Map(allCalendars(state.calendars).map((c) => [c.id, c]));
  const out: CalItem[] = [];

  for (const o of eventsOn(state.events, date)) {
    if (hidden.has(o.calendarId)) continue;
    const cal = cals.get(o.calendarId);
    const local = o.calendarId === LOCAL_CALENDAR.id;
    out.push({
      key: `e:${o.uid}:${date}`,
      kind: "event",
      date,
      start: o.start,
      end: o.end,
      allDay: o.allDay,
      title: o.title,
      color: cal?.color ?? "var(--work)",
      calendarId: o.calendarId,
      location: o.location,
      eventUid: o.uid,
      editable: local,
    });
  }

  if (!hidden.has(TASKS_CALENDAR)) {
    for (const b of planFor(state, date, now).blocks) {
      if (b.kind !== "task" || !b.task) continue;
      const t = b.task;
      out.push({
        key: `t:${t.id}`,
        kind: "task",
        date,
        start: b.start,
        end: Math.max(b.end, b.start + 15),
        allDay: false,
        title: t.title,
        color: CATEGORY_COLOR[t.category],
        calendarId: TASKS_CALENDAR,
        taskId: t.id,
        done: t.done,
        planned: !t.fixed && !t.done,
        editable: true,
      });
    }
  }
  return out;
}
