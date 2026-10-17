/**
 * Moving and resizing things on a time grid. Shared by the Calendar and the
 * Today planner so both behave exactly the same.
 */
import { fromKey } from "../../lib/date";
import { makeStamp, shiftStamp, stampDuration } from "../../lib/calendarGrid";
import type { ToastAction } from "../../lib/hooks";
import { useStore } from "../../lib/store";
import type { CalItem } from "./items";

type Toast = (message: string, action?: ToastAction) => void;

/** Move a task (pinning it to the new time) or one of your own events. */
export function moveItem(item: CalItem, date: string, start: number, toast: Toast) {
  const s = useStore.getState();
  if (item.kind === "task") {
    const t = s.tasks.find((x) => x.id === item.taskId);
    if (!t) return;
    s.updateTask(t.id, { date, start, fixed: true, someday: false });
    toast(t.fixed ? "Moved" : "Pinned to that time", { label: "Undo", run: () => s.updateTask(t.id, { date: t.date, start: t.start, fixed: t.fixed }) });
    return;
  }
  const ev = s.events.find((x) => x.uid === item.eventUid);
  if (!ev || ev.allDay) return;
  // A repeating event keeps its days; only its time of day moves.
  const dayShift = ev.rrule ? 0 : Math.round((fromKey(date).getTime() - fromKey(item.date).getTime()) / 86_400_000);
  const minuteShift = start - item.start;
  s.updateEvent(ev.uid, { start: shiftStamp(ev.start, dayShift, minuteShift), end: shiftStamp(ev.end, dayShift, minuteShift) });
  toast(ev.rrule ? "Moved every repeat" : "Event moved", { label: "Undo", run: () => s.updateEvent(ev.uid, { start: ev.start, end: ev.end }) });
}

export function resizeItem(item: CalItem, end: number) {
  const s = useStore.getState();
  if (item.kind === "task") {
    const t = s.tasks.find((x) => x.id === item.taskId);
    if (!t) return;
    s.updateTask(t.id, { duration: end - item.start, fixed: true, start: item.start, date: item.date });
    return;
  }
  const ev = s.events.find((x) => x.uid === item.eventUid);
  if (!ev || ev.allDay) return;
  const length = end - item.start;
  if (length < 15 || stampDuration(ev.start, ev.end) === length) return;
  s.updateEvent(ev.uid, { end: makeStamp(ev.start.slice(0, 10), item.start + length) });
}
