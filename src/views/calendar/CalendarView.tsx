import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Settings2 } from "lucide-react";
import { Segmented } from "../../components/ui";
import { TaskDetail } from "../../components/TaskDetail";
import { addDays, fromKey, minutesOfDay } from "../../lib/date";
import { makeStamp, monthMatrix, shiftStamp, stampDuration, weekStart } from "../../lib/calendarGrid";
import { useNow, useToast } from "../../lib/hooks";
import { isTyping, useNav } from "../../lib/nav";
import { today, useStore } from "../../lib/store";
import { EventEditor, type EditorTarget } from "./EventEditor";
import { MiniMonth } from "./MiniMonth";
import { MonthGrid } from "./MonthGrid";
import { TimeGrid, type Anchor } from "./TimeGrid";
import { allCalendars, itemsForDay, TASKS_CALENDAR, type CalItem } from "./items";

type Mode = "day" | "week" | "month";

function readMode(): Mode {
  try {
    const m = localStorage.getItem("kindred:calendar-view");
    return m === "day" || m === "month" ? m : "week";
  } catch {
    return "week";
  }
}

export function CalendarView() {
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const focus = useStore((s) => s.focus);
  const events = useStore((s) => s.events);
  const calendars = useStore((s) => s.calendars);
  const toast = useToast((s) => s.show);
  const now = useNow(60_000);
  const d = today();

  const [mode, setModeState] = useState<Mode>(readMode);
  const [anchorDate, setAnchorDate] = useState(d);
  const [editor, setEditor] = useState<{ target: EditorTarget; anchor: Anchor } | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [scrollNonce, setScrollNonce] = useState(0);

  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem("kindred:calendar-view", m);
    } catch {
      /* per-device preference only */
    }
  };

  const days = useMemo(() => {
    if (mode === "day") return [anchorDate];
    if (mode === "week") return Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchorDate), i));
    return monthMatrix(anchorDate).flat();
  }, [mode, anchorDate]);

  const items = useMemo(() => {
    const state = { tasks, settings, focus, events, calendars };
    return new Map(days.map((day) => [day, itemsForDay(state, day, now)]));
  }, [days, tasks, settings, focus, events, calendars, now]);

  const busy = useMemo(() => {
    const state = { tasks, settings, focus, events, calendars };
    return new Set(
      monthMatrix(anchorDate)
        .flat()
        .filter((day) => itemsForDay(state, day, now).length > 0),
    );
  }, [anchorDate, tasks, settings, focus, events, calendars, now]);

  const step = useCallback(
    (dir: 1 | -1) => {
      setEditor(null);
      if (mode === "day") setAnchorDate((a) => addDays(a, dir));
      else if (mode === "week") setAnchorDate((a) => addDays(a, 7 * dir));
      else
        setAnchorDate((a) => {
          const dt = fromKey(a);
          const n = new Date(dt.getFullYear(), dt.getMonth() + dir, 1);
          return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
        });
    },
    [mode],
  );

  const goToday = () => {
    setAnchorDate(d);
    setScrollNonce((n) => n + 1);
    setEditor(null);
  };

  const openDay = (day: string) => {
    setAnchorDate(day);
    setMode("day");
    setEditor(null);
  };

  const createNow = (day = anchorDate) => {
    const next = Math.ceil((minutesOfDay(new Date()) + 1) / 30) * 30;
    const start = day === d ? Math.min(next, 23 * 60) : 9 * 60;
    setEditor({ target: { mode: "new", date: day, start, end: start + 60 }, anchor: { x: window.innerWidth / 2 - 170, y: window.innerHeight / 3 } });
  };

  // Google-Calendar-style keys: d/w/m switch views, t today, j/k or n/p move, c create.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const nav = useNav.getState();
      if (nav.palette || nav.launcher || nav.help || document.querySelector(".modal")) return;
      const k = e.key.toLowerCase();
      const handled = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (k === "d") (handled(), setMode("day"));
      else if (k === "w") (handled(), setMode("week"));
      else if (k === "m") (handled(), setMode("month"));
      else if (k === "t") (handled(), goToday());
      else if (k === "j" || k === "n" || e.key === "ArrowRight") (handled(), step(1));
      else if (k === "k" || k === "p" || e.key === "ArrowLeft") (handled(), step(-1));
      else if (k === "c") (handled(), createNow());
      else if (e.key === "Escape") {
        setEditor(null);
        setOpenTask(null);
      }
    };
    // Capture phase so "c" creates here instead of opening the global launcher.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const select = (item: CalItem, anchor: Anchor) => {
    if (item.kind === "task") {
      setEditor(null);
      setOpenTask(item.taskId!);
    } else {
      setOpenTask(null);
      setEditor({ target: { mode: "item", item }, anchor });
    }
  };

  const move = (item: CalItem, date: string, start: number) => {
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
  };

  const resize = (item: CalItem, end: number) => {
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
  };

  const title = (() => {
    const a = fromKey(days[0]);
    if (mode === "day") return a.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    if (mode === "month") return fromKey(anchorDate).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const b = fromKey(days[6]);
    return a.getMonth() === b.getMonth()
      ? `${a.toLocaleDateString(undefined, { month: "long" })} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`
      : `${a.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${b.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${b.getFullYear()}`;
  })();

  const hidden = new Set(settings.hiddenCalendars);
  const calendarList = [{ id: TASKS_CALENDAR, name: "Kindred plan", color: "var(--ink-2)" }, ...allCalendars(calendars)];
  const selectedKey = editor?.target.mode === "item" ? editor.target.item.key : openTask ? `t:${openTask}` : null;
  const inView = mode === "month" ? [] : days;

  return (
    <div className="workspace calendar-workspace">
      <nav className="view-sidebar cal-sidebar" aria-label="Calendar">
        <button type="button" className="btn primary create-btn" onClick={() => createNow()}>
          <Plus size={16} /> Create
        </button>
        <MiniMonth anchor={anchorDate} today={d} inView={inView} busy={busy} onPick={(day) => (setAnchorDate(day), setEditor(null))} />
        <h2 className="section" style={{ marginTop: 18 }}>
          Calendars
        </h2>
        {calendarList.map((c) => (
          <label key={c.id} className="cal-toggle">
            <input type="checkbox" checked={!hidden.has(c.id)} onChange={() => useStore.getState().toggleCalendar(c.id)} />
            <span className="cal-check" style={{ ["--c" as string]: c.color }} aria-hidden="true" />
            <span className="truncate">{c.name}</span>
          </label>
        ))}
        <button type="button" className="btn ghost sm add-cal" onClick={() => useNav.getState().go("settings")}>
          <Settings2 size={14} /> Add a calendar
        </button>
        <p className="hint cal-keys">
          <span className="kbd">D</span> <span className="kbd">W</span> <span className="kbd">M</span> views · <span className="kbd">T</span> today · <span className="kbd">C</span> create
        </p>
      </nav>

      <section className="workspace-main" aria-label={title}>
        <header className="toolbar cal-toolbar">
          <button type="button" className="btn sm" onClick={goToday}>
            Today
          </button>
          <div className="row" style={{ gap: 2 }}>
            <button type="button" className="icon-btn" aria-label="Previous" title="Previous (K)" onClick={() => step(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="icon-btn" aria-label="Next" title="Next (J)" onClick={() => step(1)}>
              <ChevronRight size={18} />
            </button>
          </div>
          <h1 className="toolbar-title">{title}</h1>
          <span className="spacer" />
          <Segmented<Mode>
            label="View"
            value={mode}
            onChange={setMode}
            options={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
              { value: "month", label: "Month" },
            ]}
          />
        </header>

        <div className={`workspace-body${openTask ? " with-detail" : ""}`}>
          {mode === "month" ? (
            <MonthGrid
              anchor={anchorDate}
              today={d}
              items={items}
              selectedKey={selectedKey}
              onCreate={(day, anchor) => setEditor({ target: { mode: "new", date: day, start: 9 * 60, end: 10 * 60 }, anchor })}
              onSelect={select}
              onOpenDay={openDay}
            />
          ) : (
            <TimeGrid
              days={days}
              items={items}
              today={d}
              nowMin={minutesOfDay(now)}
              selectedKey={selectedKey}
              scrollNonce={scrollNonce}
              onCreate={(day, start, end, anchor) => {
                setOpenTask(null);
                setEditor({ target: { mode: "new", date: day, start, end }, anchor });
              }}
              onSelect={select}
              onMove={move}
              onResize={resize}
              onOpenDay={openDay}
            />
          )}
          {openTask && <TaskDetail taskId={openTask} onClose={() => setOpenTask(null)} />}
        </div>
      </section>

      {editor && (
        <EventEditor
          key={editor.target.mode === "item" ? editor.target.item.key : `${editor.target.date}-${editor.target.start}`}
          target={editor.target}
          anchor={editor.anchor}
          onClose={() => setEditor(null)}
          onOpenTask={(id) => {
            setEditor(null);
            setOpenTask(id);
          }}
        />
      )}
    </div>
  );
}

