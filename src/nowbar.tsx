import { StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { Check, Maximize2, Pause, Play } from "lucide-react";
import { formatDuration, formatTime, minutesOfDay } from "./lib/date";
import { useNow, useTheme } from "./lib/hooks";
import { showMainWindow } from "./lib/native";
import { blockTitle, currentAndNext } from "./lib/schedule";
import { focusElapsed, initStore, planFor, today, useStore } from "./lib/store";
import "@fontsource-variable/literata/opsz.css";
import "@fontsource-variable/literata/opsz-italic.css";
import "./styles/app.css";

/** The floating pill that sits on top of every app and says what to do now. */
function NowBar() {
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const focus = useStore((s) => s.focus);
  const events = useStore((s) => s.events);
  const { startFocus, pauseFocus, toggleDone } = useStore.getState();
  const now = useNow(focus?.runningSince ? 1000 : 10_000);
  useTheme(settings.theme);

  const plan = useMemo(() => planFor({ tasks, settings, focus, events }, today(), now), [tasks, settings, focus, events, now]);
  const nowMin = minutesOfDay(now);
  const { current, next } = currentAndNext(plan, nowMin);

  const focusTask = focus ? tasks.find((t) => t.id === focus.taskId && !t.done) : undefined;
  const task = focusTask ?? (current?.kind === "task" ? current.task : undefined);

  let title = "Free time";
  let sub = next ? `Next: ${blockTitle(next)} at ${formatTime(next.start)}` : "Nothing else planned today";
  let progress = 0;

  if (focusTask && focus) {
    const elapsed = focusElapsed(focus, now.getTime());
    const left = focusTask.duration * 60000 - elapsed;
    const mins = Math.max(0, Math.ceil(left / 60000));
    title = focusTask.title;
    sub = `${focus.runningSince ? "Focusing" : "Paused"} · ${left > 0 ? `${mins} min left` : "over time"}${next ? ` · Next: ${blockTitle(next)}` : ""}`;
    progress = elapsed / (focusTask.duration * 60000);
  } else if (task && current) {
    title = task.title;
    sub = `${formatDuration(current.end - nowMin)} left${next ? ` · Next: ${blockTitle(next)} at ${formatTime(next.start)}` : ""}`;
    progress = (nowMin - current.start) / (current.end - current.start);
  } else if (current?.kind === "break") {
    title = "Break: stretch and rest your eyes";
    sub = `${formatDuration(current.end - nowMin)} left${next ? ` · Next: ${blockTitle(next)}` : ""}`;
  } else if (current?.kind === "event") {
    title = current.event!.title;
    sub = `On your calendar · until ${formatTime(current.end)}${next ? ` · Next: ${blockTitle(next)}` : ""}`;
    progress = (nowMin - current.start) / (current.end - current.start);
  }

  const running = !!focus?.runningSince && !!focusTask;

  return (
    <div className="nowbar" data-tauri-drag-region>
      <span className={`pulse${task ? "" : " idle"}`} aria-hidden="true" data-tauri-drag-region />
      <div className="nb-text" data-tauri-drag-region>
        <span className="nb-title" data-tauri-drag-region>
          {title}
        </span>
        <span className="nb-sub" data-tauri-drag-region>
          {sub}
        </span>
      </div>
      {task && (
        <>
          <button
            type="button"
            className="nb-btn"
            aria-label={running ? "Pause focus" : "Start focus"}
            title={running ? "Pause" : "Focus"}
            onClick={() => (running ? pauseFocus() : startFocus(task.id))}
          >
            {running ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button type="button" className="nb-btn primary" aria-label="Mark done" title="Done" onClick={() => toggleDone(task.id, current?.task === task ? current.start : null)}>
            <Check size={15} strokeWidth={2.6} />
          </button>
        </>
      )}
      <button type="button" className="nb-btn" aria-label="Open Kindred" title="Open Kindred" onClick={() => showMainWindow()}>
        <Maximize2 size={13} />
      </button>
      {progress > 0 && (
        <div className="nb-progress" aria-hidden="true">
          <span style={{ width: `${Math.min(1, progress) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

initStore().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <NowBar />
    </StrictMode>,
  );
});
