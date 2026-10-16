import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowUpRight, BookOpen, CalendarDays, Check, CheckSquare, Inbox, Pause, Play, Plus, Power, Search, Settings, Sun } from "lucide-react";
import { Logo, Switch } from "./components/ui";
import { formatDuration, formatLongDate, formatTime, minutesOfDay } from "./lib/date";
import { useNow, useTheme } from "./lib/hooks";
import { eventsOn } from "./lib/ics";
import { hideTray, openView, quitApp, setNowBarVisible } from "./lib/native";
import { parseBrainDump } from "./lib/parse";
import { blockTitle, currentAndNext } from "./lib/schedule";
import { focusElapsed, initStore, planFor, today, useStore } from "./lib/store";
import { buildTriage } from "./lib/triage";
import "@fontsource-variable/literata/opsz.css";
import "./styles/app.css";

/** The panel that drops down from the menu bar / taskbar icon. */
function TrayPanel() {
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const focus = useStore((s) => s.focus);
  const events = useStore((s) => s.events);
  const mail = useStore((s) => s.mail);
  const notes = useStore((s) => s.notes);
  const triageDone = useStore((s) => s.triageDone);
  const name = useStore((s) => s.name);
  const { startFocus, pauseFocus, toggleDone, planDump, updateSettings } = useStore.getState();
  const now = useNow(focus?.runningSince ? 1000 : 20_000);
  const [text, setText] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  useTheme(settings.theme);
  const d = today();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hideTray();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const plan = useMemo(() => planFor({ tasks, settings, focus, events }, d, now), [tasks, settings, focus, events, d, now]);
  const nowMin = minutesOfDay(now);
  const { current } = currentAndNext(plan, nowMin);
  const upcoming = plan.blocks.filter((b) => b.kind !== "break" && b.start > nowMin && !(b.task?.done)).slice(0, 3);
  const signal = buildTriage({ mail, tasks, notes, triageDone }, d).signal.length;
  const openToday = tasks.filter((t) => t.date === d && !t.done && !t.someday).length;
  const doneToday = tasks.filter((t) => t.date === d && t.done).length;
  const eventsToday = eventsOn(events, d).filter((e) => !e.allDay).length;

  const focusTask = focus ? tasks.find((t) => t.id === focus.taskId && !t.done) : undefined;
  const task = focusTask ?? (current?.kind === "task" ? current.task : undefined);
  const running = !!focus?.runningSince && !!focusTask;
  let label = "Free time";
  let title = upcoming[0] ? `Next: ${blockTitle(upcoming[0])}` : "Nothing else today";
  let sub = upcoming[0] ? `at ${formatTime(upcoming[0].start)}` : "Enjoy the quiet";
  let progress = 0;
  if (focusTask && focus) {
    const elapsed = focusElapsed(focus, now.getTime());
    const left = focusTask.duration * 60000 - elapsed;
    label = running ? "Focusing" : "Paused";
    title = focusTask.title;
    sub = left > 0 ? `${Math.ceil(left / 60000)} min left` : "Over time";
    progress = elapsed / (focusTask.duration * 60000);
  } else if (current) {
    label = current.kind === "event" ? "On your calendar" : current.kind === "break" ? "Break" : "Up now";
    title = current.kind === "break" ? "Stretch and rest your eyes" : blockTitle(current);
    sub = `${formatDuration(current.end - nowMin)} left`;
    progress = (nowMin - current.start) / (current.end - current.start);
  }

  const tiles = [
    { view: "today", label: "Today", icon: Sun, stat: `${doneToday}/${doneToday + openToday} done` },
    { view: "inbox", label: "Inbox", icon: Inbox, stat: signal ? `${signal} need you` : "All clear", badge: signal },
    { view: "tasks", label: "Tasks", icon: CheckSquare, stat: `${openToday} open today` },
    { view: "calendar", label: "Calendar", icon: CalendarDays, stat: eventsToday ? `${eventsToday} events today` : "No events" },
    { view: "notes", label: "Notes", icon: BookOpen, stat: `${notes.length} ${notes.length === 1 ? "page" : "pages"}` },
    { view: "search", label: "Search", icon: Search, stat: "Everything" },
  ];

  const add = () => {
    if (!text.trim()) return;
    const n = planDump(text, d);
    setText("");
    setAdded(n === 1 ? "Added to today" : `Added ${n} things`);
    setTimeout(() => setAdded(null), 2200);
  };

  return (
    <div className="tray">
      <header className="tray-head">
        <Logo size={28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tray-title">{name ? `Hi, ${name}` : "Kindred"}</div>
          <div className="tray-date">{formatLongDate(d)}</div>
        </div>
        <button type="button" className="icon-btn" aria-label="Open Kindred" title="Open Kindred" onClick={() => openView("today")}>
          <ArrowUpRight size={17} />
        </button>
      </header>

      <section className={`tray-now${task ? " is-active" : ""}`} aria-label="Right now">
        <div className="tray-now-label">
          <span className={`pulse${task || current ? "" : " idle"}`} /> {label}
        </div>
        <div className="tray-now-title">{title}</div>
        <div className="tray-now-row">
          <span className="tray-now-sub">{sub}</span>
          {task && (
            <span className="row" style={{ gap: 6 }}>
              <button type="button" className="tray-round" aria-label={running ? "Pause focus" : "Start focus"} onClick={() => (running ? pauseFocus() : startFocus(task.id))}>
                {running ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button type="button" className="tray-round is-primary" aria-label="Mark done" onClick={() => toggleDone(task.id, current?.task === task ? current.start : null)}>
                <Check size={15} strokeWidth={2.6} />
              </button>
            </span>
          )}
        </div>
        {progress > 0 && (
          <div className="tray-progress" aria-hidden="true">
            <span style={{ width: `${Math.min(1, progress) * 100}%` }} />
          </div>
        )}
      </section>

      <div className="tray-capture">
        <Plus size={16} aria-hidden="true" />
        <label htmlFor="tray-add" className="sr-only">
          Add to today
        </label>
        <input
          id="tray-add"
          autoFocus
          placeholder={added ?? "Add anything… “call mom at 6pm”"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        {text && parseBrainDump(text, d).length > 0 && (
          <button type="button" className="tray-add-btn" onClick={add}>
            Add
          </button>
        )}
      </div>

      {upcoming.length > 0 && (
        <section className="tray-next" aria-label="Coming up">
          {upcoming.map((b, i) => (
            <div className="tray-next-item" key={i}>
              <span className="tray-next-time">{formatTime(b.start)}</span>
              <span className={`tray-next-bar ${b.kind === "event" ? "is-event" : `cat-${b.task!.category}`}`} aria-hidden="true" />
              <span className="truncate">{blockTitle(b)}</span>
            </div>
          ))}
        </section>
      )}

      <nav className="tray-tiles" aria-label="Open Kindred">
        {tiles.map((t) => (
          <button key={t.view} type="button" className="tray-tile" onClick={() => openView(t.view)}>
            <span className="tray-tile-icon">
              <t.icon size={17} strokeWidth={1.8} aria-hidden="true" />
              {!!t.badge && <span className="tray-badge">{t.badge}</span>}
            </span>
            <span className="tray-tile-label">{t.label}</span>
            <span className="tray-tile-stat">{t.stat}</span>
          </button>
        ))}
      </nav>

      <footer className="tray-foot">
        <label className="row small" style={{ gap: 8 }}>
          <Switch
            label="Now Bar"
            checked={settings.nowBar}
            onChange={(v) => {
              updateSettings({ nowBar: v });
              setNowBarVisible(v);
            }}
          />
          Now Bar
        </label>
        <span className="spacer" />
        <button type="button" className="icon-btn" aria-label="Settings" title="Settings" onClick={() => openView("settings")}>
          <Settings size={15} />
        </button>
        <button type="button" className="icon-btn" aria-label="Quit Kindred" title="Quit Kindred" onClick={() => quitApp()}>
          <Power size={15} />
        </button>
      </footer>
    </div>
  );
}

initStore().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <TrayPanel />
    </StrictMode>,
  );
});
