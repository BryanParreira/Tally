import { useEffect, useMemo, useState } from "react";
import { Archive, CalendarDays, CheckCircle2, Flag, Hash, Inbox, Plus, Search, Sun } from "lucide-react";
import { CheckButton, Segmented } from "../components/ui";
import { TaskDetail } from "../components/TaskDetail";
import { dueLabel, formatDay, formatDuration, formatTime } from "../lib/date";
import { useToast } from "../lib/hooks";
import { isTyping, reveal, useNav } from "../lib/nav";
import { parseBrainDump } from "../lib/parse";
import { today, useStore } from "../lib/store";
import { allTags, filterTasks, groupTasks, statusOf, STATUS_LABEL, type GroupBy, type TaskView } from "../lib/taskViews";
import type { Priority, Task, TaskStatus } from "../lib/types";

const VIEWS: { id: TaskView; label: string; icon: typeof Sun }[] = [
  { id: "open", label: "All open", icon: Inbox },
  { id: "today", label: "Today", icon: Sun },
  { id: "upcoming", label: "Upcoming", icon: CalendarDays },
  { id: "someday", label: "Someday", icon: Archive },
  { id: "done", label: "Done", icon: CheckCircle2 },
];

const BOARD: (TaskStatus | "done")[] = ["todo", "doing", "waiting", "done"];
const PRIORITY_CYCLE: Priority[] = ["normal", "high", "urgent", "low"];
const STATUS_CYCLE: TaskStatus[] = ["todo", "doing", "waiting"];

export function TasksView() {
  const tasks = useStore((s) => s.tasks);
  const target = useNav((s) => s.target);
  const toast = useToast((s) => s.show);
  const [view, setView] = useState<TaskView>("open");
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [display, setDisplay] = useState<"list" | "board">("list");
  const [groupBy, setGroupBy] = useState<GroupBy>("date");
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const d = today();

  useEffect(() => {
    if (target?.kind === "task") {
      setView("open");
      setTag(null);
      setSelected(target.id);
      setOpen(target.id);
      reveal(`trow-${target.id}`);
    }
  }, [target]);

  const filtered = useMemo(() => filterTasks(tasks, { view, tag, query }, d), [tasks, view, tag, query, d]);
  const groups = useMemo(() => groupTasks(filtered, groupBy, d), [filtered, groupBy, d]);
  const flat = groups.flatMap((g) => g.tasks);
  const tags = useMemo(() => allTags(tasks), [tasks]);
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.id, filterTasks(tasks, { view: v.id }, d).length])), [tasks, d]);

  // j/k move · x/e done · enter details · p priority · s status · esc close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const nav = useNav.getState();
      if (nav.palette || nav.launcher || document.querySelector(".modal")) return;
      const i = flat.findIndex((t) => t.id === selected);
      const t = flat[i];
      const { updateTask, toggleDone } = useStore.getState();
      if (["j", "k", "ArrowDown", "ArrowUp"].includes(e.key)) {
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
      s.addTask({ ...it, source: "manual", someday: it.someday || view === "someday", tags: tag ? [...new Set([...(it.tags ?? []), tag])] : it.tags }, d),
    );
    setNewTitle("");
    toast(items.length === 1 ? "Task added" : `${items.length} tasks added`);
  };

  return (
    <div className="workspace">
      <nav className="view-sidebar" aria-label="Task views">
        <h2 className="section">Tasks</h2>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            className="nav-item"
            aria-current={view === v.id && !tag ? "page" : undefined}
            onClick={() => {
              setView(v.id);
              setTag(null);
            }}
          >
            <v.icon size={16} strokeWidth={1.8} aria-hidden="true" />
            <span className="label-text">{v.label}</span>
            <span className="nav-count">{counts[v.id] || ""}</span>
          </button>
        ))}
        {tags.length > 0 && (
          <>
            <h2 className="section" style={{ marginTop: 22 }}>
              Tags
            </h2>
            {tags.map(({ tag: t, count }) => (
              <button
                key={t}
                type="button"
                className="nav-item"
                aria-current={tag === t ? "page" : undefined}
                onClick={() => {
                  setTag(t);
                  setView("open");
                }}
              >
                <Hash size={15} aria-hidden="true" />
                <span className="label-text">{t}</span>
                <span className="nav-count">{count}</span>
              </button>
            ))}
          </>
        )}
      </nav>

      <section className="workspace-main" aria-label="Tasks">
        <header className="toolbar">
          <h1 className="toolbar-title">{tag ? `#${tag}` : VIEWS.find((v) => v.id === view)!.label}</h1>
          <span className="muted small">{filtered.length}</span>
          <span className="spacer" />
          <label className="search-field">
            <Search size={14} aria-hidden="true" />
            <span className="sr-only">Filter tasks</span>
            <input placeholder="Filter" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQuery("")} />
          </label>
          {display === "list" && (
            <label className="row small" style={{ gap: 6 }}>
              <span className="muted">Group</span>
              <select className="input compact" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)} aria-label="Group by">
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
            ]}
          />
        </header>

        <div className="quick-add">
          <Plus size={16} aria-hidden="true" />
          <label htmlFor="quick-add" className="sr-only">
            New task
          </label>
          <input
            id="quick-add"
            placeholder={view === "someday" ? "Add to someday…" : "New task… (try “read ch. 5 friday #bio !”)"}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") (e.target as HTMLInputElement).blur();
            }}
          />
        </div>

        <div className={`workspace-body${open ? " with-detail" : ""}`}>
          <div className="workspace-scroll">
            {display === "list" ? (
              <ListDisplay groups={groups} selected={selected} onSelect={setSelected} onOpen={setOpen} today={d} />
            ) : (
              <BoardDisplay tasks={filtered} selected={selected} onSelect={setSelected} onOpen={setOpen} today={d} />
            )}
            {filtered.length === 0 && (
              <div className="empty">
                <span className="glyph">
                  <CheckCircle2 size={20} aria-hidden="true" />
                </span>
                <h3>{view === "done" ? "Nothing finished yet" : "All clear"}</h3>
                <p>{view === "someday" ? "Ideas you're not ready to plan live here. Type “someday” when adding a task." : "Add a task above, or brain-dump from Today."}</p>
              </div>
            )}
          </div>
          {open && <TaskDetail taskId={open} onClose={() => setOpen(null)} />}
        </div>
      </section>
    </div>
  );
}

interface DisplayProps {
  selected: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  today: string;
}

function TaskMeta({ t, today: d }: { t: Task; today: string }) {
  return (
    <span className="trow-meta">
      {!t.someday && <span className="nowrap">{formatDay(t.date, d)}{t.fixed && t.start !== null ? ` · ${formatTime(t.start)}` : ""}</span>}
      <span className="nowrap">{formatDuration(t.duration)}</span>
      {(t.priority === "urgent" || t.priority === "high") && !t.done && (
        <span className={`chip${t.priority === "urgent" ? " brand" : ""}`}>
          <Flag size={11} aria-hidden="true" /> {t.priority === "urgent" ? "Urgent" : "High"}
        </span>
      )}
      {t.status && t.status !== "todo" && !t.done && <span className="chip">{STATUS_LABEL[t.status]}</span>}
      {t.due && !t.done && <span className="chip brand">{dueLabel(t.due, d)}</span>}
      {t.tags?.map((tag) => (
        <span key={tag} className="chip tag-chip">
          #{tag}
        </span>
      ))}
    </span>
  );
}

function ListDisplay({ groups, selected, onSelect, onOpen, today: d }: DisplayProps & { groups: ReturnType<typeof groupTasks> }) {
  const toggleDone = useStore((s) => s.toggleDone);
  return (
    <div>
      {groups.map((g) => (
        <section key={g.key} className="tgroup">
          <h2 className="section">
            {g.label} <span className="muted">{g.tasks.length}</span>
          </h2>
          {g.tasks.map((t) => (
            <div
              key={t.id}
              id={`trow-${t.id}`}
              className={`trow${t.id === selected ? " is-selected" : ""}${t.done ? " is-done" : ""}`}
              onClick={() => {
                onSelect(t.id);
                onOpen(t.id);
              }}
            >
              <span className={`dot ${t.category}`} aria-hidden="true" />
              <span onClick={(e) => e.stopPropagation()}>
                <CheckButton checked={t.done} label={t.done ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`} onToggle={() => toggleDone(t.id, null)} />
              </span>
              <span className="trow-title truncate">{t.title}</span>
              <TaskMeta t={t} today={d} />
            </div>
          ))}
        </section>
      ))}
    </div>
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
            <h2 className="section">
              {STATUS_LABEL[col]} <span className="muted">{items.length}</span>
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
                <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <span className={`dot ${t.category}`} style={{ marginTop: 8 }} aria-hidden="true" />
                  <span className="board-title">{t.title}</span>
                </div>
                <TaskMeta t={t} today={d} />
              </article>
            ))}
            {items.length === 0 && <p className="board-empty">Drop tasks here</p>}
          </section>
        );
      })}
    </div>
  );
}
