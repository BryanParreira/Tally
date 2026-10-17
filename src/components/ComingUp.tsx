import { CalendarDays, ArrowRight } from "lucide-react";
import { formatTime } from "../lib/date";
import { eventsOn } from "../lib/ics";
import { useNav } from "../lib/nav";
import { blockTitle, type DayPlan, type PlannedBlock } from "../lib/schedule";
import { tomorrowOf, useStore } from "../lib/store";

/** The rest of the day and tomorrow's first few events, beside Today. */
export function ComingUp({ plan, date, today, nowMin }: { plan: DayPlan; date: string; today: string; nowMin: number }) {
  const calendars = useStore((s) => s.calendars);
  const events = useStore((s) => s.events);
  const go = useNav((s) => s.go);
  const color = (calendarId: string) => (calendarId === "local" ? "var(--warn)" : (calendars.find((c) => c.id === calendarId)?.color ?? "var(--work)"));
  const colorOf = (b: PlannedBlock) => (b.kind === "task" ? `var(--${b.task!.category})` : color(b.event!.calendarId));

  const later = plan.blocks.filter((b) => b.kind !== "break" && b.end > nowMin && !b.task?.done).slice(0, 5);
  const next = tomorrowOf(date);
  const tomorrow = eventsOn(events, next)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start)
    .slice(0, 3);

  return (
    <section className="side-card" aria-label="Coming up">
      <header className="side-head">
        <CalendarDays size={14} aria-hidden="true" />
        <span className="side-title">{date === today ? "Rest of today" : "This day"}</span>
        <span className="spacer" />
        <button type="button" className="icon-btn" title="Open Calendar" aria-label="Open Calendar" onClick={() => go("calendar")}>
          <ArrowRight size={14} />
        </button>
      </header>
      {later.length === 0 && <p className="side-empty">Nothing else planned.</p>}
      {later.map((b, i) => (
        <div key={i} className="cu-row">
          {b.kind === "task" ? <span className="mark-task" aria-hidden="true" /> : <span className="mark-event" style={{ background: colorOf(b) }} aria-hidden="true" />}
          <span className="cu-text">
            <span className="cu-title truncate">{blockTitle(b)}</span>
            <span className="cu-time">
              {formatTime(b.start)} – {formatTime(b.end)}
            </span>
          </span>
        </div>
      ))}
      {tomorrow.length > 0 && (
        <>
          <div className="cu-sep">Tomorrow</div>
          {tomorrow.map((e) => (
            <div key={e.uid} className="cu-row">
              <span className="mark-event" style={{ background: color(e.calendarId) }} aria-hidden="true" />
              <span className="cu-text">
                <span className="cu-title truncate">{e.title}</span>
                <span className="cu-time">{e.allDay ? "All day" : `${formatTime(e.start)} – ${formatTime(e.end)}`}</span>
              </span>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
