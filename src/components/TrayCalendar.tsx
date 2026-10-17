import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, formatDay, formatTime, fromKey } from "../lib/date";
import { monthMatrix, sameMonth } from "../lib/calendarGrid";
import { eventsOn } from "../lib/ics";
import { openView } from "../lib/native";
import { blockTitle } from "../lib/schedule";
import { planFor, useStore } from "../lib/store";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

/** A real little calendar for the tray: the month, dots on busy days, and the picked day's agenda. */
export function TrayCalendar({ today }: { today: string }) {
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const events = useStore((s) => s.events);
  const calendars = useStore((s) => s.calendars);
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(today);
  const weeks = monthMatrix(month);
  const names = WEEKDAYS.map((wd) => new Date(2026, 0, 4 + wd).toLocaleDateString(undefined, { weekday: "narrow" }));

  const busy = useMemo(() => {
    const out = new Map<string, number>();
    for (const d of weeks.flat()) {
      const n = eventsOn(events, d).length + tasks.filter((t) => t.date === d && !t.done && !t.someday).length;
      if (n) out.set(d, n);
    }
    return out;
  }, [weeks, events, tasks]);

  const color = (calendarId: string) => (calendarId === "local" ? "var(--warn)" : (calendars.find((c) => c.id === calendarId)?.color ?? "var(--work)"));
  const items = useMemo(() => {
    const allDay = eventsOn(events, day).filter((e) => e.allDay);
    const blocks = planFor({ tasks, settings, events }, day).blocks.filter((b) => b.kind !== "break");
    return [
      ...allDay.map((e) => ({ key: e.uid, title: e.title, time: "All day", task: false, done: false, color: color(e.calendarId) })),
      ...blocks.map((b) => ({
        key: b.task?.id ?? `${b.event?.uid}-${b.start}`,
        title: blockTitle(b),
        time: `${formatTime(b.start)} – ${formatTime(b.end)}`,
        task: b.kind === "task",
        done: !!b.task?.done,
        color: b.kind === "task" ? `var(--${b.task!.category})` : color(b.event!.calendarId),
      })),
    ];
  }, [day, tasks, settings, events, calendars]);

  const shiftMonth = (n: number) => {
    const d = fromKey(month);
    const m = new Date(d.getFullYear(), d.getMonth() + n, 1);
    setMonth(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-01`);
  };

  return (
    <div className="tcal">
      <div className="tcal-head">
        <span className="tcal-title">{fromKey(month).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <span className="spacer" />
        {(!sameMonth(month, today) || day !== today) && (
          <button type="button" className="tcal-today" onClick={() => (setDay(today), setMonth(today))}>
            Today
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
          <ChevronLeft size={15} />
        </button>
        <button type="button" className="icon-btn" aria-label="Next month" onClick={() => shiftMonth(1)}>
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="tcal-grid" role="grid">
        {names.map((n, i) => (
          <span key={i} className="tcal-wd">
            {n}
          </span>
        ))}
        {weeks.flat().map((d) => (
          <button
            key={d}
            type="button"
            className={`tcal-day${sameMonth(d, month) ? "" : " is-out"}${d === today ? " is-today" : ""}${d === day ? " is-picked" : ""}`}
            onClick={() => {
              setDay(d);
              if (!sameMonth(d, month)) setMonth(d);
            }}
            aria-label={fromKey(d).toDateString()}
            aria-pressed={d === day}
          >
            {fromKey(d).getDate()}
            {busy.get(d) ? <span className="tcal-dot" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
      <div className="tcal-agenda">
        <div className="tcal-agenda-head">
          <span>{day === today ? "Today" : day === addDays(today, 1) ? "Tomorrow" : formatDay(day, today)}</span>
          <span className="muted">{fromKey(day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={day} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            {items.length === 0 && <p className="tray-empty" style={{ margin: "14px 8px" }}>Nothing planned.</p>}
            {items.map((it) => (
              <button key={it.key} type="button" className={`tray-row${it.done ? " is-done" : ""}`} onClick={() => openView("calendar")}>
                {it.task ? <span className="mark-task" aria-hidden="true" /> : <span className="mark-event" style={{ background: it.color }} aria-hidden="true" />}
                <span className="tray-row-title truncate">{it.title}</span>
                <span className="tray-row-time">{it.time}</span>
              </button>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
