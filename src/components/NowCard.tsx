import { Check, Coffee, Pause, Play, Square, Sunrise } from "lucide-react";
import { formatDuration, formatTime } from "../lib/date";
import { blockTitle, currentAndNext, type DayPlan } from "../lib/schedule";
import { focusElapsed, useStore } from "../lib/store";
import { useNow } from "../lib/hooks";
import type { Settings } from "../lib/types";
import { Ring } from "./ui";

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** The big card at the top of Today: what to do right now, and what's next. */
export function NowHero({ plan, nowMin }: { plan: DayPlan; nowMin: number }) {
  const focus = useStore((s) => s.focus);
  const tasks = useStore((s) => s.tasks);
  const { startFocus, pauseFocus, stopFocus, toggleDone } = useStore.getState();
  const tick = useNow(focus?.runningSince ? 1000 : 15000);
  const { current, next } = currentAndNext(plan, nowMin);
  const nextLine = next ? (
    <div className="hero-next">
      <span className="eyebrow" style={{ margin: 0 }}>
        Next
      </span>
      <span className="hero-next-title truncate">{blockTitle(next)}</span>
      <span className="muted small nowrap">{formatTime(next.start)}</span>
    </div>
  ) : null;

  const focusTask = focus ? tasks.find((t) => t.id === focus.taskId) : undefined;
  if (focus && focusTask) {
    const elapsed = focusElapsed(focus, tick.getTime());
    const total = focusTask.duration * 60000;
    const left = total - elapsed;
    const running = !!focus.runningSince;
    return (
      <section className="hero is-focus" aria-label="Focus session">
        <Ring progress={elapsed / total} size={96} />
        <div className="hero-main">
          <span className="hero-label">
            <span className={`pulse${running ? "" : " idle"}`} /> {running ? "Focusing" : "Paused"}
          </span>
          <h2 className="hero-title">{focusTask.title}</h2>
          <div className="hero-sub">
            <span className="countdown">{left >= 0 ? clock(left) : `+${clock(-left)}`}</span>
            <span className="muted small">{left >= 0 ? `left of ${formatDuration(focusTask.duration)}` : "over time"}</span>
          </div>
        </div>
        <div className="hero-actions">
          {running ? (
            <button type="button" className="btn" onClick={pauseFocus}>
              <Pause size={15} /> Pause
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => startFocus(focusTask.id)}>
              <Play size={15} /> Resume
            </button>
          )}
          <button type="button" className="btn primary" onClick={() => toggleDone(focusTask.id, null)}>
            <Check size={15} /> Done
          </button>
          <button type="button" className="icon-btn" aria-label="End focus session" title="End session" onClick={stopFocus}>
            <Square size={14} />
          </button>
        </div>
        {nextLine}
      </section>
    );
  }

  const task = current?.kind === "task" ? current.task : undefined;
  if (task && current) {
    const progress = (nowMin - current.start) / (current.end - current.start);
    return (
      <section className="hero" aria-label="Right now">
        <div className="hero-main">
          <span className="hero-label">
            <span className="pulse" /> Up now · {formatTime(current.start)} – {formatTime(current.end)}
          </span>
          <h2 className="hero-title">{task.title}</h2>
          <div className="hero-progress" aria-hidden="true">
            <span style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }} />
          </div>
          <span className="muted small">{formatDuration(current.end - nowMin)} left</span>
        </div>
        <div className="hero-actions">
          <button type="button" className="btn primary" onClick={() => startFocus(task.id)}>
            <Play size={15} /> Start focus
          </button>
          <button type="button" className="btn" onClick={() => toggleDone(task.id, current.start)}>
            <Check size={15} /> Done
          </button>
        </div>
        {nextLine}
      </section>
    );
  }

  const isEvent = current?.kind === "event";
  const isBreak = current?.kind === "break";
  return (
    <section className="hero is-quiet" aria-label="Right now">
      <span className="hero-icon" aria-hidden="true">
        {isBreak ? <Coffee size={20} /> : <Sunrise size={20} />}
      </span>
      <div className="hero-main">
        <span className="hero-label">{isEvent ? "On your calendar" : isBreak ? "Break time" : "Free time"}</span>
        <h2 className="hero-title">
          {isEvent ? current!.event!.title : isBreak ? "Step away for a moment" : next ? "You're free right now" : "Nothing left for today"}
        </h2>
        <span className="muted small">
          {isEvent || isBreak ? `Until ${formatTime(current!.end)}` : next ? `Next up at ${formatTime(next.start)}` : "Add something above and it'll be fitted in."}
        </span>
      </div>
      {next?.task && !isEvent && (
        <div className="hero-actions">
          <button type="button" className="btn" onClick={() => startFocus(next.task!.id)}>
            <Play size={15} /> Start {next.task.title.length > 22 ? "next task" : next.task.title} early
          </button>
        </div>
      )}
      {nextLine}
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
