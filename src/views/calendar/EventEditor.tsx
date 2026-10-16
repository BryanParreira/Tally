import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock, Lock, MapPin, Repeat, Trash2, X } from "lucide-react";
import { Segmented } from "../../components/ui";
import { addDays, formatTime, fromKey } from "../../lib/date";
import { makeStamp, stampMinutes } from "../../lib/calendarGrid";
import { timeOptions, useToast } from "../../lib/hooks";
import { parseItem } from "../../lib/parse";
import { LOCAL_CALENDAR, useStore } from "../../lib/store";
import type { CalEvent, Recurrence } from "../../lib/types";
import type { CalItem } from "./items";
import { allCalendars } from "./items";

export type EditorTarget =
  | { mode: "new"; date: string; start: number; end: number; allDay?: boolean }
  | { mode: "item"; item: CalItem };

type RepeatChoice = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

const TIMES = timeOptions(15);

function toRule(choice: RepeatChoice, date: string): Recurrence | undefined {
  switch (choice) {
    case "none":
      return undefined;
    case "daily":
      return { freq: "DAILY", interval: 1 };
    case "weekdays":
      return { freq: "WEEKLY", interval: 1, byday: [1, 2, 3, 4, 5] };
    case "weekly":
      return { freq: "WEEKLY", interval: 1, byday: [fromKey(date).getDay()] };
    case "monthly":
      return { freq: "MONTHLY", interval: 1 };
    case "yearly":
      return { freq: "YEARLY", interval: 1 };
  }
}

function fromRule(rule: Recurrence | undefined): RepeatChoice {
  if (!rule) return "none";
  if (rule.freq === "DAILY") return "daily";
  if (rule.freq === "WEEKLY") return rule.byday?.length === 5 ? "weekdays" : "weekly";
  return rule.freq === "MONTHLY" ? "monthly" : "yearly";
}

interface Props {
  target: EditorTarget;
  anchor: { x: number; y: number };
  onClose(): void;
  onOpenTask(id: string): void;
}

/** A small card for creating and editing events, placed next to where you clicked. */
export function EventEditor({ target, anchor, onClose, onOpenTask }: Props) {
  const events = useStore((s) => s.events);
  const calendars = useStore((s) => s.calendars);
  const { addEvent, updateEvent, deleteEvent, addTask } = useStore.getState();
  const toast = useToast((s) => s.show);

  const existing: CalEvent | undefined = target.mode === "item" && target.item.eventUid ? events.find((e) => e.uid === target.item.eventUid) : undefined;
  const readOnly = target.mode === "item" && !target.item.editable;
  const calendar = target.mode === "item" ? allCalendars(calendars).find((c) => c.id === target.item.calendarId) : LOCAL_CALENDAR;

  const initial = useMemo(() => {
    if (target.mode === "new") return { title: "", date: target.date, start: target.start, end: target.end, allDay: !!target.allDay, location: "", repeat: "none" as RepeatChoice };
    const it = target.item;
    const date = existing && existing.rrule ? it.date : (existing?.start.slice(0, 10) ?? it.date);
    return {
      title: it.title,
      date,
      start: existing && !existing.allDay ? stampMinutes(existing.start) : it.start,
      end: existing && !existing.allDay ? stampMinutes(existing.start) + Math.max(15, it.end - it.start) : it.end,
      allDay: it.allDay,
      location: it.location ?? "",
      repeat: fromRule(existing?.rrule),
    };
  }, [target, existing]);

  const [kind, setKind] = useState<"event" | "task">("event");
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.date);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [allDay, setAllDay] = useState(initial.allDay);
  const [location, setLocation] = useState(initial.location);
  const [repeat, setRepeat] = useState<RepeatChoice>(initial.repeat);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const left = Math.min(Math.max(12, anchor.x + 14), window.innerWidth - 372);
  const top = Math.min(Math.max(12, anchor.y - 60), window.innerHeight - (readOnly ? 220 : 470));

  const save = () => {
    const name = title.trim();
    if (!name) return;
    const safeEnd = end > start ? end : start + 30;
    if (target.mode === "new" && kind === "task") {
      const parsed = parseItem(name, date);
      addTask({ ...(parsed ?? { title: name, category: "life", duration: safeEnd - start, start, date, due: null }), title: parsed?.title ?? name, start, duration: safeEnd - start, date, source: "manual" }, date);
      toast(`Task added at ${formatTime(start)}`);
      return onClose();
    }
    const body: Omit<CalEvent, "uid" | "calendarId"> = {
      title: name,
      allDay,
      start: allDay ? date : makeStamp(date, start),
      end: allDay ? addDays(date, 1) : makeStamp(date, safeEnd),
      ...(location.trim() ? { location: location.trim() } : {}),
      ...(repeat !== "none" ? { rrule: toRule(repeat, date) } : {}),
    };
    if (existing) {
      updateEvent(existing.uid, { ...body, location: location.trim() || undefined, rrule: toRule(repeat, date), exdates: repeat === "none" ? undefined : existing.exdates });
      toast("Event updated");
    } else {
      addEvent(body);
      toast("Event added");
    }
    onClose();
  };

  return (
    <>
      <div className="popover-catcher" onMouseDown={onClose} />
      <div className="event-editor" role="dialog" aria-label={target.mode === "new" ? "New event" : title} style={{ left, top }}>
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="cal-swatch" style={{ background: calendar?.color ?? "var(--brand)" }} aria-hidden="true" />
          <span className="small muted">{target.mode === "new" ? (kind === "event" ? LOCAL_CALENDAR.name : "Kindred plan") : calendar?.name}</span>
          <span className="spacer" />
          {existing && !readOnly && (
            <button
              type="button"
              className="icon-btn"
              aria-label="Delete event"
              title="Delete event"
              onClick={() => {
                const snapshot = existing;
                deleteEvent(existing.uid);
                toast("Event deleted", { label: "Undo", run: () => useStore.setState((s) => ({ events: [...s.events, snapshot] })) });
                onClose();
              }}
            >
              <Trash2 size={15} />
            </button>
          )}
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>

        {readOnly ? (
          <>
            <h3 className="editor-title-static">{initial.title}</h3>
            <p className="editor-line">
              <Clock size={14} aria-hidden="true" />
              {fromKey(initial.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              {initial.allDay ? " · All day" : ` · ${formatTime(initial.start)} – ${formatTime(initial.end)}`}
            </p>
            {initial.location && (
              <p className="editor-line">
                <MapPin size={14} aria-hidden="true" /> {initial.location}
              </p>
            )}
            <p className="editor-line muted">
              <Lock size={13} aria-hidden="true" /> From a subscribed calendar. Change it in the calendar app it came from.
            </p>
          </>
        ) : (
          <>
            {target.mode === "new" && (
              <div style={{ marginBottom: 10 }}>
                <Segmented
                  label="Type"
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: "event", label: "Event" },
                    { value: "task", label: "Task" },
                  ]}
                />
              </div>
            )}
            <label htmlFor="editor-title" className="sr-only">
              Title
            </label>
            <input
              id="editor-title"
              className="editor-title"
              placeholder={kind === "task" ? "What needs doing?" : "Add a title"}
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            <div className="editor-row">
              <CalendarDays size={15} aria-hidden="true" />
              <input type="date" className="input compact-input" aria-label="Date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              {kind === "event" && (
                <label className="row small" style={{ gap: 6 }}>
                  <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} style={{ accentColor: "var(--brand)" }} /> All day
                </label>
              )}
            </div>
            {!allDay && (
              <div className="editor-row">
                <Clock size={15} aria-hidden="true" />
                <select className="input compact-input" aria-label="Starts" value={start} onChange={(e) => {
                  const v = Number(e.target.value);
                  setEnd(v + (end - start));
                  setStart(v);
                }}>
                  {TIMES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <span className="muted">–</span>
                <select className="input compact-input" aria-label="Ends" value={Math.min(end, 1425)} onChange={(e) => setEnd(Number(e.target.value))}>
                  {TIMES.filter((t) => t.value > start).map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {kind === "event" && (
              <>
                <div className="editor-row">
                  <Repeat size={15} aria-hidden="true" />
                  <select className="input compact-input" aria-label="Repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatChoice)} style={{ flex: 1 }}>
                    <option value="none">Does not repeat</option>
                    <option value="daily">Every day</option>
                    <option value="weekdays">Every weekday (Mon–Fri)</option>
                    <option value="weekly">Every week on {fromKey(date).toLocaleDateString(undefined, { weekday: "long" })}</option>
                    <option value="monthly">Every month on day {fromKey(date).getDate()}</option>
                    <option value="yearly">Every year</option>
                  </select>
                </div>
                <div className="editor-row">
                  <MapPin size={15} aria-hidden="true" />
                  <input className="input compact-input" style={{ flex: 1 }} placeholder="Add a location" value={location} onChange={(e) => setLocation(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
                </div>
              </>
            )}
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
              {target.mode === "item" && target.item.taskId && (
                <button type="button" className="btn ghost sm" onClick={() => onOpenTask(target.item.taskId!)}>
                  Task details
                </button>
              )}
              <button type="button" className="btn primary sm" disabled={!title.trim()} onClick={save}>
                Save
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
