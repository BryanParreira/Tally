import { Check, Pause, Play, Square, Sunrise } from "lucide-react";
import { formatDuration, formatTime } from "../lib/date";
import { currentAndNext, type DayPlan } from "../lib/schedule";
import { focusElapsed, useStore } from "../lib/store";
import { useNow } from "../lib/hooks";
import { Ring } from "./ui";

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function NowCard({ plan, nowMin }: { plan: DayPlan; nowMin: number }) {
  const focus = useStore((s) => s.focus);
  const tasks = useStore((s) => s.tasks);
  const { startFocus, pauseFocus, stopFocus, toggleDone } = useStore.getState();
  const tick = useNow(focus?.runningSince ? 1000 : 15000);

  const focusTask = focus ? tasks.find((t) => t.id === focus.taskId) : undefined;
  if (focus && focusTask) {
    const elapsed = focusElapsed(focus, tick.getTime());
    const total = focusTask.duration * 60000;
    const left = total - elapsed;
    const running = !!focus.runningSince;
    return (
      <section className="card now-card" aria-label="Focus session">
        <div className="label-top">
          <span className={`pulse${running ? "" : " idle"}`} />
          {running ? "Focusing" : "Paused"}
        </div>
        <h3>{focusTask.title}</h3>
        <div className="ring-wrap">
          <Ring progress={elapsed / total} />
          <div>
            <div className="countdown" aria-live="off">
              {left >= 0 ? clock(left) : `+${clock(-left)}`}
            </div>
            <div className="muted small">{left >= 0 ? `of ${formatDuration(focusTask.duration)}` : "Over time. Wrap up when you're ready"}</div>
          </div>
        </div>
        <div className="row">
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
          <span className="spacer" />
          <button type="button" className="icon-btn" aria-label="End focus session" title="End session" onClick={stopFocus}>
            <Square size={14} />
          </button>
        </div>
      </section>
    );
  }

  const { current, next } = currentAndNext(plan, nowMin);
  const task = current?.kind === "task" ? current.task : undefined;

  return (
    <section className="card now-card" aria-label="Right now">
      <div className="label-top">
        <span className={`pulse${task ? "" : " idle"}`} />
        {task ? "Up now" : current?.kind === "break" ? "Break time" : "Free time"}
      </div>
      {task && current ? (
        <>
          <h3>{task.title}</h3>
          <p className="muted small" style={{ margin: "0 0 16px" }}>
            {formatTime(current.start)} – {formatTime(current.end)} · {formatDuration(current.end - nowMin)} left
          </p>
          <div className="row">
            <button type="button" className="btn brand" onClick={() => startFocus(task.id)}>
              <Play size={15} /> Start focus
            </button>
            <button type="button" className="btn" onClick={() => toggleDone(task.id, current.start)}>
              <Check size={15} /> Done
            </button>
          </div>
        </>
      ) : (
        <>
          <h3>{current?.kind === "break" ? "Step away for a moment" : next ? "You're free right now" : "Nothing left today"}</h3>
          <p className="muted small" style={{ margin: "0 0 4px" }}>
            {next?.task ? `Next: ${next.task.title} at ${formatTime(next.start)}` : "Enjoy it, or dump new tasks above and they'll be fitted in."}
          </p>
          {next?.task && (
            <div className="row" style={{ marginTop: 14 }}>
              <button type="button" className="btn" onClick={() => startFocus(next.task!.id)}>
                <Play size={15} /> Start it early
              </button>
            </div>
          )}
          {!next && (
            <div className="row muted small" style={{ marginTop: 10, gap: 6 }}>
              <Sunrise size={14} aria-hidden="true" /> Tomorrow gets planned the same way.
            </div>
          )}
        </>
      )}
    </section>
  );
}
