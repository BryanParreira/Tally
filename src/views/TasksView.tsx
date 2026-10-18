import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Flag, Plus, Search } from "lucide-react";
import { CATEGORY_LABEL, Segmented } from "../components/ui";
import { TaskDetail } from "../components/TaskDetail";
import { PriorityIcon, StatusIcon, TaskTable } from "../components/TaskTable";
import { TASK_VIEWS as VIEWS } from "../components/TasksNav";
import { addDays, daysBetween, dueLabel, formatDay, formatTime } from "../lib/date";
import { useToast } from "../lib/hooks";
import { isTyping, reveal, useNav } from "../lib/nav";
import { parseBrainDump } from "../lib/parse";
import { projectName } from "../lib/projects";
import { today, useStore } from "../lib/store";
import { useTaskFilter } from "../lib/taskFilter";
import { filterTasks, groupTasks, sortTasks, statusOf, STATUS_LABEL, type GroupBy, type SortBy } from "../lib/taskViews";
import type { Priority, Task, TaskStatus } from "../lib/types";


type Display = "list" | "board" | "timeline";
const DISPLAYS: Display[] = ["list", "board", "timeline"];
const BOARD: (TaskStatus | "done")[] = ["todo", "doing", "waiting", "done"];
const PRIORITY_CYCLE: Priority[] = ["normal", "high", "urgent", "low"];
const STATUS_CYCLE: TaskStatus[] = ["todo", "doing", "waiting"];

/** Remember how the page was left (view, display, grouping) on this device. */
function pref<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(`tally:tasks:${key}`) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function savePref(key: string, value: string) {
  try {
    localStorage.setItem(`tally:tasks:${key}`, value);
  } catch {
    /* per-device preference only */
  }
}

export function TasksView() {
  const tasks = useStore((s) => s.tasks);
  const target = useNav((s) => s.target);
  const toast = useToast((s) => s.show);
  const { view, tag, area, projectId, setView, reset } = useTaskFilter();
  const projects = useStore((s) => s.projects);
  const [query, setQuery] = useState("");
  const [display, setDisplayState] = useState<Display>(() => pref("display", "list", DISPLAYS));
  const [groupBy, setGroupByState] = useState<GroupBy>(() => pref("group", "date", ["date", "status", "priority", "category", "none"] as const));
  const [sortBy, setSortByState] = useState<SortBy>(() => pref("sort", "date", ["date", "priority", "created", "title", "status"] as const));
  const [reversed, setReversed] = useState(() => pref("rev", "no", ["yes", "no"] as const) === "yes");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const d = today();

  const setDisplay = (v: Display) => (setDisplayState(v), savePref("display", v));
  const setGroupBy = (v: GroupBy) => (setGroupByState(v), savePref("group", v));
  const setSortBy = (v: SortBy) => (setSortByState(v), savePref("sort", v));
  /** Clicking the active column flips the order; clicking another sorts by it. */
  const sortColumn = (by: SortBy) => {
    const flip = by === sortBy ? !reversed : false;
    setSortBy(by);
    setReversed(flip);
    savePref("rev", flip ? "yes" : "no");
  };
  const toggleGroup = (key: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  useEffect(() => {
    if (target?.kind === "task") {
      reset();
      setQuery("");
      setSelected(target.id);
      setOpen(target.id);
      reveal(`trow-${target.id}`);
    }
  }, [target]);

  const filtered = useMemo(() => filterTasks(tasks, { view, tag, category: area, projectId, query }, d), [tasks, view, tag, area, projectId, query, d]);
  const groups = useMemo(() => groupTasks(filtered, groupBy, d, sortBy, reversed), [filtered, groupBy, sortBy, reversed, d]);
  const flat = display === "list" ? groups.filter((g) => !collapsed.has(g.key)).flatMap((g) => g.tasks) : sortTasks(filtered, sortBy, reversed);
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.id, filterTasks(tasks, { view: v.id }, d).length])), [tasks, d]);

  // j/k move · x/e done · enter details · p priority · s status · 1-5 views · v display · f filter · [ rail · esc close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const nav = useNav.getState();
      if (nav.palette || nav.launcher || document.querySelector(".modal")) return;
      const i = flat.findIndex((t) => t.id === selected);
      const t = flat[i];
      const { updateTask, toggleDone } = useStore.getState();
      const viewKey = VIEWS.find((v) => v.key === e.key);
      if (viewKey) {
        setView(viewKey.id);
      } else if (e.key === "v") {
        setDisplay(DISPLAYS[(DISPLAYS.indexOf(display) + 1) % DISPLAYS.length]);
      } else if (e.key === "f") {
        e.preventDefault();
        document.getElementById("task-filter")?.focus();
      } else if (["j", "k", "ArrowDown", "ArrowUp"].includes(e.key)) {
        if (!flat.length) return;
        e.preventDefault();
        const down = e.key === "j" || e.key === "ArrowDown";
        const n = flat[i < 0 ? 0 : Math.min(flat.length - 1, Math.max(0, i + (down ? 1 : -1)))];
        setSelected(n.id);
        if (open) setOpen(n.id);
        reveal(`trow-${n.id}`);
      } else if ((e.key === "x" || e.key === "e") && t) {
        toggleDone(t.id, null);
      } else if (e.key === "Enter" && t) {
        e.preventDefault();
        setOpen(t.id);
      } else if (e.key === "p" && t) {
        const p = PRIORITY_CYCLE[(PRIORITY_CYCLE.indexOf(t.priority ?? "normal") + 1) % PRIORITY_CYCLE.length];
        updateTask(t.id, { priority: p });
        toast(`Priority: ${p}`);
      } else if (e.key === "s" && t && !t.done) {
        const s = STATUS_CYCLE[(STATUS_CYCLE.indexOf(t.status ?? "todo") + 1) % STATUS_CYCLE.length];
        updateTask(t.id, { status: s });
        toast(`Status: ${STATUS_LABEL[s]}`);
      } else if (e.key === "Escape") {
        setOpen(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const add = () => {
    const items = parseBrainDump(newTitle, d);
    if (!items.length) return;
    const s = useStore.getState();
    items.forEach((it) =>
      s.addTask(
        { ...it, source: "manual", someday: it.someday || view === "someday", category: area ?? it.category, projectId: projectId ?? undefined, tags: tag ? [...new Set([...(it.tags ?? []), tag])] : it.tags },
        d,
      ),
    );
    setNewTitle("");
    toast(items.length === 1 ? "Task added" : `${items.length} tasks added`);
  };

  const summary = (() => {
    const overdue = tasks.filter((t) => !t.done && !t.someday && t.date < d).length;
    return [`${counts.today ?? 0} today`, overdue ? `${overdue} overdue` : "", `${counts.upcoming ?? 0} upcoming`].filter(Boolean).join(" · ");
  })();
  const viewLabel = VIEWS.find((v) => v.id === view)!.label;
  const heading = tag ? `#${tag}` : area ? CATEGORY_LABEL[area] : projectId ? projectName(projects.find((p) => p.id === projectId) ?? { name: "" }) : viewLabel;

  return (
    <div className="tasks-page">
      <div className={`tasks-main${open ? " has-detail" : ""}`}>
        <div className={`tasks-inner${display === "timeline" ? " is-wide" : ""}`}>
          <header className="tasks-head">
            <div>
              <h1 className="title">{heading}</h1>
              <p className="subtitle">{summary}</p>
            </div>
            <div className="row">
              <label className="search-field">
                <Search size={14} aria-hidden="true" />
                <span className="sr-only">Filter tasks</span>
                <input id="task-filter" placeholder="Filter (F)" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Escape" && (setQuery(""), (e.target as HTMLInputElement).blur())} />
              </label>
              {(tag || area || projectId || query) && (
                <button type="button" className="btn ghost sm" onClick={() => (reset(), setQuery(""))}>
                  Clear filters
                </button>
              )}
              {display === "list" && (
              <label className="group-by">
                <span className="muted">Group</span>
                <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} aria-label="Group by">
                  <option value="date">Date</option>
                  <option value="status">Status</option>
                  <option value="priority">Priority</option>
                  <option value="category">Area</option>
                  <option value="none">None</option>
                </select>
              </label>
            )}
              <Segmented
                label="Display"
                value={display}
                onChange={setDisplay}
                options={[
                  { value: "list", label: "List" },
                  { value: "board", label: "Board" },
                  { value: "timeline", label: "Timeline" },
                ]}
              />
            </div>
          </header>

          <div className="capture tasks-add">
            <div className="capture-row">
              <Plus size={16} color="var(--ink-3)" aria-hidden="true" />
              <label htmlFor="quick-add" className="sr-only">
                New task
              </label>
              <input
                id="quick-add"
                placeholder={view === "someday" ? "Add to someday…" : tag ? `New task in #${tag}…` : "New task… try “read ch. 5 friday #bio !”"}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") add();
                  if (e.key === "Escape") (e.target as HTMLInputElement).blur();
                }}
              />
            </div>
          </div>

          {display === "list" && <TaskTable groups={groups} groupBy={groupBy} selected={selected} today={d} sortBy={sortBy} reversed={reversed} collapsed={collapsed} onSort={sortColumn} onToggleGroup={toggleGroup} onSelect={setSelected} onOpen={setOpen} />}
          {display === "board" && <BoardDisplay tasks={filtered} selected={selected} onSelect={setSelected} onOpen={setOpen} today={d} />}
          {display === "timeline" && <TimelineDisplay tasks={flat} selected={selected} onSelect={setSelected} onOpen={setOpen} today={d} />}
          {filtered.length === 0 && (
            <div className="empty">
              <span className="glyph">
                <CheckCircle2 size={20} aria-hidden="true" />
              </span>
              <h3>{view === "done" ? "Nothing finished yet" : tag ? `Nothing tagged #${tag}` : "All clear"}</h3>
              <p>{view === "someday" ? "Ideas you're not ready to plan live here. Type “someday” when adding a task." : "Add a task above, or pick something from your Inbox."}</p>
            </div>
          )}
        </div>
      </div>
      {open && (
        <div className="drawer">
          <TaskDetail taskId={open} onClose={() => setOpen(null)} />
        </div>
      )}
    </div>
  );
}

interface DisplayProps {
  selected: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  today: string;
}

function TaskMeta({ t, today: d, group }: { t: Task; today: string; group?: string }) {
  // Under a "Today" or "Tomorrow" heading the day would just repeat it.
  const day = group === formatDay(t.date, d) ? "" : formatDay(t.date, d);
  const time = t.fixed && t.start !== null ? formatTime(t.start) : "";
  // Calm by default: when it is, plus only the signals that change what you do.
  return (
    <span className="trow-meta">
      {(t.priority === "urgent" || t.priority === "high") && !t.done && <Flag size={12} className={`sig prio ${t.priority}`} aria-label={t.priority === "urgent" ? "Urgent" : "High priority"} />}
      {t.due && !t.done && t.due < d && <span className="sig due">{dueLabel(t.due, d)}</span>}
      {t.status === "waiting" && !t.done && <span className="sig">Waiting</span>}
      {!t.someday && (day || time) && <span className="nowrap">{[day, time].filter(Boolean).join(" · ")}</span>}
    </span>
  );
}

function BoardDisplay({ tasks, selected, onSelect, onOpen, today: d }: DisplayProps & { tasks: Task[] }) {
  const { updateTask, toggleDone } = useStore.getState();
  const [over, setOver] = useState<string | null>(null);
  const move = (id: string, col: TaskStatus | "done") => {
    const t = useStore.getState().tasks.find((x) => x.id === id);
    if (!t) return;
    if (col === "done") {
      if (!t.done) toggleDone(id, null);
    } else {
      if (t.done) toggleDone(id, null);
      updateTask(id, { status: col });
    }
  };
  return (
    <div className="board">
      {BOARD.map((col) => {
        const items = groupTasks(
          tasks.filter((t) => statusOf(t) === col),
          "none",
          d,
        )[0].tasks;
        return (
          <section
            key={col}
            className={`board-col${over === col ? " is-over" : ""}`}
            aria-label={STATUS_LABEL[col]}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(col);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              move(e.dataTransfer.getData("text/plain"), col);
            }}
          >
            <h2 className="board-head" data-tint={col}>
              <StatusIcon status={col} size={14} />
              <span>{STATUS_LABEL[col]}</span>
              <span className="tk-pill">{items.length}</span>
            </h2>
            {items.map((t) => (
              <article
                key={t.id}
                id={`trow-${t.id}`}
                className={`board-card${t.id === selected ? " is-selected" : ""}${t.done ? " is-done" : ""}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                onClick={() => {
                  onSelect(t.id);
                  onOpen(t.id);
                }}
              >
                <span className="board-title">{t.title}</span>
                <div className="board-props">
                  <PriorityIcon priority={t.priority ?? "normal"} size={14} />
                  <span className={`dot ${t.category}`} aria-hidden="true" />
                  <TaskMeta t={t} today={d} />
                </div>
              </article>
            ))}
            {items.length === 0 && <p className="board-empty">Drop tasks here</p>}
          </section>
        );
      })}
    </div>
  );
}

const DAY_W = 34;
const SPAN = 28;

/** Tasks as bars from the day they start to their deadline, over the next four weeks. */
function TimelineDisplay({ tasks, selected, onSelect, onOpen, today: d }: DisplayProps & { tasks: Task[] }) {
  const items = tasks.filter((t) => !t.someday && !t.done);
  const first = addDays(d, -2);
  const days = Array.from({ length: SPAN }, (_, i) => addDays(first, i));
  const col = (date: string) => Math.max(0, Math.min(SPAN - 1, daysBetween(first, date)));
  return (
    <div className="gantt" style={{ ["--day-w" as string]: `${DAY_W}px` }}>
      <div className="gantt-row gantt-head">
        <span className="gantt-label" />
        <div className="gantt-track" style={{ width: SPAN * DAY_W }}>
          {days.map((day, i) => {
            const date = new Date(`${day}T00:00`);
            return (
              <span key={day} className={`gantt-day${day === d ? " is-today" : ""}${date.getDay() % 6 === 0 ? " is-weekend" : ""}`} style={{ left: i * DAY_W, width: DAY_W }}>
                {date.getDate() === 1 || i === 0 ? date.toLocaleDateString(undefined, { month: "short" }) : ""}
                <b>{date.getDate()}</b>
              </span>
            );
          })}
        </div>
      </div>
      {items.map((t) => {
        const end = t.due && t.due > t.date ? t.due : t.date;
        const left = col(t.date);
        const width = Math.max(1, col(end) - left + 1);
        return (
          <div key={t.id} id={`trow-${t.id}`} className={`gantt-row${t.id === selected ? " is-selected" : ""}`} onClick={() => (onSelect(t.id), onOpen(t.id))}>
            <span className="gantt-label truncate">{t.title}</span>
            <div className="gantt-track" style={{ width: SPAN * DAY_W }}>
              <span className="gantt-today" style={{ left: col(d) * DAY_W + DAY_W / 2 }} />
              <span className={`gantt-bar ${t.category}${t.due && t.due < d ? " is-late" : ""}`} style={{ left: left * DAY_W + 2, width: width * DAY_W - 4 }} title={`${formatDay(t.date, d)}${t.due ? ` → due ${formatDay(t.due, d)}` : ""}`} />
            </div>
          </div>
        );
      })}
      {items.length === 0 && <p className="board-empty">Nothing planned in the next weeks.</p>}
    </div>
  );
}
