import { Check } from "lucide-react";
import { formatTime } from "../lib/date";
import { blockTitle, currentAndNext, type DayPlan, type PlannedBlock } from "../lib/schedule";
import { useStore } from "../lib/store";
import type { CalendarSource, Settings } from "../lib/types";

/** What's on now and what's next, in one card that matches the tray. Plain times, no timers. */
export function NowCard({ plan, nowMin, calendars }: { plan: DayPlan; nowMin: number; calendars: CalendarSource[] }) {
  const { toggleDone } = useStore.getState();
  const { current, next } = currentAndNext(plan, nowMin);
  if (!current && !next) return null;
  const colorOf = (b: PlannedBlock) =>
    b.kind === "break" ? "var(--ink-3)" : b.kind === "task" ? `var(--${b.task!.category})` : (calendars.find((c) => c.id === b.event!.calendarId)?.color ?? "var(--warn)");
  const task = current?.kind === "task" ? current.task : undefined;
  return (
    <section className={`now-card${current ? "" : " is-free"}`} style={current ? { ["--c" as string]: colorOf(current) } : undefined} aria-label="Right now">
      <div className="now-card-main">
        <div className="now-card-label">
          {current && <span className="pulse" aria-hidden="true" />}
          {current ? (current.kind === "event" ? "On now" : current.kind === "break" ? "Break" : "Now") : "Free"}
        </div>
        <div className="now-card-title">{current ? (current.kind === "break" ? "Stretch and rest your eyes" : blockTitle(current)) : `Free until ${formatTime(next!.start)}`}</div>
        <div className="now-card-sub">{current ? `${formatTime(current.start)} – ${formatTime(current.end)}` : `Then ${blockTitle(next!)}`}</div>
      </div>
      {task && (
        <button type="button" className="tray-done" onClick={() => toggleDone(task.id, current!.start)}>
          <Check size={14} strokeWidth={2.6} /> Done
        </button>
      )}
      {current && next && (
        <div className="now-card-next">
          <span className="muted">Next</span>
          <span className="truncate">{blockTitle(next)}</span>
          <span className="muted">{formatTime(next.start)}</span>
        </div>
      )}
    </section>
  );
}

/** A thin bar of the whole day: what's planned, what's done, and where "now" is. */
export function DayStrip({ plan, settings, nowMin, isToday }: { plan: DayPlan; settings: Settings; nowMin: number; isToday: boolean }) {
  const from = Math.min(settings.dayStart, ...plan.blocks.map((b) => b.start));
  const to = Math.max(settings.dayEnd, ...plan.blocks.map((b) => b.end));
  const pct = (m: number) => `${((m - from) / (to - from)) * 100}%`;
  const ticks = [];
  for (let h = Math.ceil(from / 180) * 180; h <= to; h += 180) ticks.push(h);
  return (
    <div className="daystrip" aria-hidden="true">
      <div className="daystrip-bar">
        {plan.blocks.map((b, i) =>
          b.kind === "break" ? null : (
            <span
              key={i}
              className={`daystrip-seg ${b.kind === "event" ? "is-event" : `cat-${b.task!.category}`}${b.task?.done ? " is-done" : ""}`}
              style={{ left: pct(b.start), width: `calc(${pct(b.end)} - ${pct(b.start)} - 1px)` }}
              title={`${formatTime(b.start)} ${blockTitle(b)}`}
            />
          ),
        )}
        {isToday && nowMin >= from && nowMin <= to && <span className="daystrip-now" style={{ left: pct(nowMin) }} />}
      </div>
      <div className="daystrip-ticks">
        {ticks.map((t) => (
          <span key={t} style={{ left: pct(t) }}>
            {formatTime(t).replace(":00", "")}
          </span>
        ))}
      </div>
    </div>
  );
}
