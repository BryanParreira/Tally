import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock, Lock, MapPin, Repeat, Trash2, X } from "lucide-react";
import { Segmented } from "../../components/ui";
import { addDays, formatDuration, formatTime, fromKey } from "../../lib/date";
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

/** What a new event will look like, so the grid can preview it while you type. */
export interface EventDraft {
  date: string;
  start: number;
  end: number;
  allDay: boolean;
  title: string;
}

interface Props {
  target: EditorTarget;
  anchor: { x: number; y: number };
  onClose(): void;
  onOpenTask(id: string): void;
  onDraft?(draft: EventDraft | null): void;
}

const GAP = 14;
const EDGE = 12;

/** A small card for creating and editing events, placed next to where you clicked. */
export function EventEditor({ target, anchor, onClose, onOpenTask, onDraft }: Props) {
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

  // Your own events change as you edit them, like a paper diary: the block on the
  // grid moves with every change, and closing offers one Undo for the lot.
  const live = target.mode === "item" && !!existing && !readOnly;
  const snapshot = useRef(existing);
  const safeEnd = end > start ? end : start + 30;
  const eventBody = (): Omit<CalEvent, "uid" | "calendarId"> => ({
    title: title.trim() || snapshot.current?.title || "Untitled",
    allDay,
    start: allDay ? date : makeStamp(date, start),
    end: allDay ? addDays(date, 1) : makeStamp(date, safeEnd),
    location: location.trim() || undefined,
    rrule: toRule(repeat, date),
    exdates: repeat === "none" ? undefined : snapshot.current?.exdates,
  });
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (live) updateEvent(existing!.uid, eventBody());
  }, [title, date, start, end, allDay, location, repeat]);

  // A new event shows on the grid while you fill it in.
  useEffect(() => {
    if (target.mode !== "new") return;
    onDraft?.({ date, start, end: safeEnd, allDay, title: title.trim() });
  }, [date, start, safeEnd, allDay, title]);
  useEffect(() => () => onDraft?.(null), []);

  const finish = () => {
    const before = snapshot.current;
    const after = live ? useStore.getState().events.find((e) => e.uid === before!.uid) : undefined;
    if (before && after && JSON.stringify(before) !== JSON.stringify(after)) {
      toast("Event updated", { label: "Undo", run: () => useStore.getState().updateEvent(before.uid, before) });
    }
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        live ? finish() : save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Sit beside the click, flip to the other side near the edge, and stay on screen as the card grows.
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const place = () => {
      const { width, height } = el.getBoundingClientRect();
      const right = anchor.x + GAP;
      const left = right + width <= window.innerWidth - EDGE ? right : Math.max(EDGE, anchor.x - GAP - width);
      const top = Math.min(Math.max(EDGE, anchor.y - 60), Math.max(EDGE, window.innerHeight - height - EDGE));
      setPos((p) => (p && p.left === left && Math.abs(p.top - top) < 1 ? p : { left: p?.left ?? left, top }));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor.x, anchor.y]);

  const save = () => {
    const name = title.trim();
    if (!name) return;
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
      <div className="popover-catcher" onMouseDown={finish} />
      <div
        ref={card}
        className="event-editor"
        role="dialog"
        aria-label={target.mode === "new" ? "New event" : title}
        style={pos ? { left: pos.left, top: pos.top } : { left: anchor.x + GAP, top: anchor.y - 60, opacity: 0 }}
      >
        {/* A band of the calendar's colour, like a cover. */}
        <div className="ee-band" style={{ background: calendar?.color ?? "var(--brand)" }} aria-hidden="true" />
        <button type="button" className="icon-btn ee-close" aria-label="Close" onClick={finish}>
          <X size={15} />
        </button>
        {readOnly ? (
          <>
            <h3 className="editor-title-static">{initial.title}</h3>
            <p className="ee-when">
              {fromKey(initial.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              <br />
              <span>{initial.allDay ? "All day" : `${formatTime(initial.start)} – ${formatTime(initial.end)} · ${formatDuration(initial.end - initial.start)}`}</span>
            </p>
            {initial.location && (
              <p className="editor-line">
                <MapPin size={14} aria-hidden="true" /> {initial.location}
              </p>
            )}
            <div className="ee-foot">
              <span className="ee-cal">
                <span className="cal-swatch" style={{ background: calendar?.color ?? "var(--brand)" }} aria-hidden="true" />
                <span className="truncate">{calendar?.name}</span>
              </span>
              <span className="spacer" />
              <span className="ee-lock" title="From a subscribed calendar. Change it in the calendar app it came from.">
                <Lock size={12} aria-hidden="true" /> Read-only
              </span>
            </div>
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
              onKeyDown={(e) => e.key === "Enter" && (live ? finish() : save())}
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
                      {t.label} · {formatDuration(t.value - start)}
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
                  <input className="input compact-input" style={{ flex: 1 }} placeholder="Add a location" value={location} onChange={(e) => setLocation(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (live ? finish() : save())} />
                </div>
              </>
            )}
            <div className="ee-foot">
              <span className="ee-cal">
                <span className="cal-swatch" style={{ background: calendar?.color ?? "var(--brand)" }} aria-hidden="true" />
                <span className="truncate">{target.mode === "new" ? (kind === "event" ? LOCAL_CALENDAR.name : "Kindred plan") : calendar?.name}</span>
              </span>
              <span className="spacer" />
              {existing && (
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
              {target.mode === "item" && target.item.taskId && (
                <button type="button" className="btn ghost sm" onClick={() => onOpenTask(target.item.taskId!)}>
                  Task details
                </button>
              )}
              {live ? (
                <button type="button" className="btn primary sm" onClick={finish}>
                  Done
                </button>
              ) : (
                <button type="button" className="btn primary sm" disabled={!title.trim()} onClick={save} title={`Save (${navigator.platform.includes("Mac") ? "⌘" : "Ctrl"} Enter)`}>
                  Save
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
