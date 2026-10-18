import { AnimatePresence, motion } from "motion/react";
import { Archive, ArrowDown, ArrowRight, ChevronRight, Flag, Sun } from "lucide-react";
import { spring } from "../lib/motion";
import { CATEGORY_LABEL, CheckButton } from "./ui";
import { addDays, dueLabel, formatDay, formatTime } from "../lib/date";
import { useToast } from "../lib/hooks";
import { useStore } from "../lib/store";
import { PRIORITY_LABEL, statusOf, STATUS_LABEL, type GroupBy, type SortBy, type TaskGroup } from "../lib/taskViews";
import type { Priority, Task, TaskStatus } from "../lib/types";

const PRIORITY_CYCLE: Priority[] = ["normal", "high", "urgent", "low"];

/** Status as a small ring: empty, half-filled, dashed, or a tick. */
export function StatusIcon({ status, size = 15 }: { status: TaskStatus | "done"; size?: number }) {
  const c = `var(--st-${status})`;
  return (
    <svg className="st-icon" width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {status === "todo" && <circle cx="8" cy="8" r="6" stroke={c} strokeWidth="1.6" />}
      {status === "doing" && (
        <>
          <circle cx="8" cy="8" r="6" stroke={c} strokeWidth="1.6" />
          <path d="M8 4.2a3.8 3.8 0 0 1 0 7.6z" fill={c} />
        </>
      )}
      {status === "waiting" && <circle cx="8" cy="8" r="6" stroke={c} strokeWidth="1.6" strokeDasharray="2.6 2.4" />}
      {status === "done" && (
        <>
          <circle cx="8" cy="8" r="7" fill={c} />
          <path d="M5 8.2l2.1 2.1L11 6.2" stroke="var(--bg, #fff)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

/** Priority as four rising bars; the more filled, the more urgent. */
export function PriorityIcon({ priority, size = 15 }: { priority: Priority; size?: number }) {
  const n = { low: 1, normal: 2, high: 3, urgent: 4 }[priority];
  return (
    <svg className={`pr-icon ${priority}`} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={1.5 + i * 3.6} y={11 - i * 2.6} width="2.4" height={3 + i * 2.6} rx="0.8" className={i < n ? "on" : "off"} />
      ))}
    </svg>
  );
}

interface Props {
  groups: TaskGroup[];
  groupBy: GroupBy;
  selected: string | null;
  today: string;
  sortBy: SortBy;
  reversed: boolean;
  collapsed: Set<string>;
  onSort(by: SortBy): void;
  onToggleGroup(key: string): void;
  onSelect(id: string): void;
  onOpen(id: string): void;
}

function SortHead({ label, by, sortBy, reversed, onSort, className }: { label: string; by?: SortBy; sortBy: SortBy; reversed: boolean; onSort(by: SortBy): void; className?: string }) {
  if (!by) return <span className={`tk-col ${className ?? ""}`}>{label}</span>;
  const active = sortBy === by;
  return (
    <span className={`tk-col ${className ?? ""}`}>
      <button type="button" className={`tk-sort${active ? " is-on" : ""}`} onClick={() => onSort(by)} aria-label={`Sort by ${label.toLowerCase()}`}>
        <span className="truncate">{label}</span>
        <ArrowDown size={12} className={active && reversed ? "flip" : ""} aria-hidden="true" />
      </button>
    </span>
  );
}

function GroupIcon({ groupBy, groupKey }: { groupBy: GroupBy; groupKey: string }) {
  if (groupBy === "status") return <StatusIcon status={(["doing", "todo", "waiting", "done"] as const)[Number(groupKey)] ?? "todo"} size={14} />;
  if (groupBy === "priority") return <PriorityIcon priority={(["urgent", "high", "normal", "low"] as const)[Number(groupKey)] ?? "normal"} size={14} />;
  if (groupBy === "category") return <span className={`dot ${groupKey}`} aria-hidden="true" />;
  return null;
}

/** The task list as a table: a column per property, collapsible groups, sortable headers. */
export function TaskTable({ groups, groupBy, selected, today: d, sortBy, reversed, collapsed, onSort, onToggleGroup, onSelect, onOpen }: Props) {
  const toggleDone = useStore((s) => s.toggleDone);
  const head = { sortBy, reversed, onSort };
  return (
    <div className="tk-table" role="table" aria-label="Tasks">
      <div className="tk-row tk-head" role="row">
        <span />
        <SortHead label="Task" by="title" {...head} className="tk-title-col" />
        <SortHead label="Status" by="status" {...head} />
        <SortHead label="Priority" by="priority" {...head} />
        <span className="tk-col tk-area-col">Area</span>
        <SortHead label="When" by="date" {...head} className="tk-end" />
      </div>
      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        const tint = groupBy === "status" ? ["doing", "todo", "waiting", "done"][Number(g.key)] : undefined;
        return (
          <section key={g.key} className="tk-group">
            {groupBy !== "none" && (
              <button type="button" className={`tk-group-head${g.key === "0-overdue" ? " is-overdue" : ""}`} data-tint={tint} aria-expanded={!isCollapsed} onClick={() => onToggleGroup(g.key)}>
                <ChevronRight size={12} className={isCollapsed ? "" : "open"} aria-hidden="true" />
                <GroupIcon groupBy={groupBy} groupKey={g.key} />
                <span className="truncate">{g.label}</span>
                <span className="tk-pill">{g.tasks.length}</span>
              </button>
            )}
            <AnimatePresence initial={false}>
              {!isCollapsed &&
                g.tasks.map((t) => {
                  const status = statusOf(t);
                  const priority = t.priority ?? "normal";
                  const day = formatDay(t.date, d);
                  const time = t.fixed && t.start !== null ? formatTime(t.start) : "";
                  const overdue = !t.done && !t.someday && t.date < d;
                  return (
                    <motion.div
                      key={t.id}
                      id={`trow-${t.id}`}
                      role="row"
                      className={`tk-row tk-task${t.id === selected ? " is-selected" : ""}${t.done ? " is-done" : ""}`}
                      layout="position"
                      initial={{ opacity: 0, y: -3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                      transition={spring}
                      onClick={() => (onSelect(t.id), onOpen(t.id))}
                    >
                      <span className={`tk-check${t.done ? " is-on" : ""}`} onClick={(e) => e.stopPropagation()}>
                        <CheckButton checked={t.done} label={t.done ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`} onToggle={() => toggleDone(t.id, null)} />
                      </span>
                      <span className="tk-title truncate">
                        <StatusIcon status={status} />
                        <span className="tk-title-text truncate">{t.title}</span>
                        {!!t.tags?.length && <span className="tk-tags">{t.tags.slice(0, 2).map((x) => `#${x}`).join(" ")}</span>}
                      </span>
                      <span className="tk-cell tk-status" title={STATUS_LABEL[status]}>
                        <StatusIcon status={status} size={14} />
                        <span className="tk-label truncate">{STATUS_LABEL[status]}</span>
                      </span>
                      <span className="tk-cell tk-priority" title={PRIORITY_LABEL[priority]}>
                        <PriorityIcon priority={priority} size={14} />
                        <span className="tk-label truncate">{PRIORITY_LABEL[priority]}</span>
                      </span>
                      <span className="tk-cell tk-area" title={CATEGORY_LABEL[t.category]}>
                        <span className={`dot ${t.category}`} aria-hidden="true" />
                        <span className="tk-label truncate">{CATEGORY_LABEL[t.category]}</span>
                      </span>
                      <span className={`tk-cell tk-end tk-when${overdue ? " is-overdue" : ""}`}>
                        <span className="truncate">
                          {t.someday ? "Someday" : t.due && !t.done && t.due < d ? dueLabel(t.due, d) : [day, time].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {!t.done && <RowQuick t={t} today={d} />}
                    </motion.div>
                  );
                })}
            </AnimatePresence>
          </section>
        );
      })}
    </div>
  );
}

/** Plan a task without opening it: today, tomorrow, someday, or bump its priority. */
export function RowQuick({ t, today: d }: { t: Task; today: string }) {
  const toast = useToast((s) => s.show);
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  const move = (patch: Partial<Task>, msg: string) => {
    const s = useStore.getState();
    const before = { date: t.date, someday: t.someday, start: t.start, fixed: t.fixed };
    s.updateTask(t.id, { ...patch, start: t.fixed ? t.start : null });
    toast(msg, { label: "Undo", run: () => useStore.getState().updateTask(t.id, before) });
  };
  return (
    <span className="trow-quick">
      {(t.date !== d || t.someday) && (
        <button type="button" className="icon-btn" title="Do today" aria-label="Do today" onClick={stop(() => move({ date: d, someday: false }, "Moved to today"))}>
          <Sun size={14} />
        </button>
      )}
      <button type="button" className="icon-btn" title="Tomorrow" aria-label="Move to tomorrow" onClick={stop(() => move({ date: addDays(d, 1), someday: false }, "Moved to tomorrow"))}>
        <ArrowRight size={14} />
      </button>
      {!t.someday && (
        <button type="button" className="icon-btn" title="Someday" aria-label="Move to someday" onClick={stop(() => move({ someday: true }, "Moved to someday"))}>
          <Archive size={14} />
        </button>
      )}
      <button
        type="button"
        className={`icon-btn${t.priority === "urgent" || t.priority === "high" ? " is-flagged" : ""}`}
        title="Priority (P)"
        aria-label="Change priority"
        onClick={stop(() => {
          const p = PRIORITY_CYCLE[(PRIORITY_CYCLE.indexOf(t.priority ?? "normal") + 1) % PRIORITY_CYCLE.length];
          useStore.getState().updateTask(t.id, { priority: p });
          toast(`Priority: ${p}`);
        })}
      >
        <Flag size={14} />
      </button>
    </span>
  );
}
