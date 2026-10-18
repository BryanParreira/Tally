import { Fragment, useState } from "react";
import { motion } from "motion/react";
import { spring } from "../lib/motion";
import { ArrowRight, Coffee, Mail, Pin, PinOff, Plus, Trash2, Minus, GraduationCap, NotebookPen } from "lucide-react";
import { dueLabel, formatDay, formatDuration, formatTime } from "../lib/date";
import type { DayPlan, PlannedBlock } from "../lib/schedule";
import { restoreDeletedTask, tomorrowOf, useStore } from "../lib/store";
import type { Task } from "../lib/types";
import { useToast } from "../lib/hooks";
import { useNav } from "../lib/nav";
import { CheckButton } from "./ui";
import { PriorityIcon } from "./TaskTable";

interface Props {
  plan: DayPlan;
  date: string;
  today: string;
  nowMin: number;
  isToday: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  /** Only tasks (the Today planner shows events in the calendar beside it). */
  tasksOnly?: boolean;
}

const SOURCE: Partial<Record<Task["source"], { icon: typeof Mail; label: string }>> = {
  email: { icon: Mail, label: "From email" },
  study: { icon: GraduationCap, label: "Study plan" },
  note: { icon: NotebookPen, label: "From a note" },
};

function partOfDay(m: number): string {
  return m < 12 * 60 ? "Morning" : m < 17 * 60 ? "Afternoon" : "Evening";
}

export function Timeline({ plan, date, today, nowMin, isToday, selected, onSelect, onOpen, tasksOnly }: Props) {
  const blocks = tasksOnly ? plan.blocks.filter((b) => b.kind === "task") : plan.blocks;
  if (blocks.length === 0) {
    return (
      <div className="td-empty">
        <h3>{isToday ? "Your day is wide open" : `Nothing planned for ${formatDay(date, today).toLowerCase()}`}</h3>
        <p>Type what you need to do in the bar below, or pick something from your Inbox. Tally fits it around your calendar, and you can drag it to any time.</p>
      </div>
    );
  }

  const nowIndex = isToday ? blocks.findIndex((b) => b.end > nowMin && !(b.kind === "task" && b.task?.done)) : -1;
  const showLineAt = nowIndex === -1 && isToday ? blocks.length : nowIndex;

  return (
    <div className="td-list">
      {blocks.map((b, i) => (
        <Fragment key={b.task?.id ?? b.event?.uid ?? `break-${b.start}`}>
          {(i === 0 || partOfDay(blocks[i - 1].start) !== partOfDay(b.start)) && <h2 className="td-part">{partOfDay(b.start)}</h2>}
          {isToday && i === showLineAt && !(b.start <= nowMin && nowMin < b.end) && <NowLine nowMin={nowMin} />}
          {/* Rows glide to their new times when the plan reflows. */}
          <motion.div layout="position" transition={spring}>
            <Row
              block={b}
              nowMin={nowMin}
              isToday={isToday}
              delay={Math.min(i, 12) * 25}
              date={date}
              selected={!!b.task && b.task.id === selected}
              onSelect={onSelect}
              onOpen={onOpen}
            />
          </motion.div>
        </Fragment>
      ))}
      {isToday && showLineAt === blocks.length && <NowLine nowMin={nowMin} />}
    </div>
  );
}

function NowLine({ nowMin }: { nowMin: number }) {
  return (
    <div className="td-now" aria-label={`Now, ${formatTime(nowMin)}`}>
      <span className="td-now-time">{formatTime(nowMin)}</span>
      <span className="td-now-line" />
    </div>
  );
}

interface RowProps {
  block: PlannedBlock;
  nowMin: number;
  isToday: boolean;
  delay: number;
  date: string;
  selected: boolean;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
}

function Row(props: RowProps) {
  const { block, delay } = props;
  if (block.kind === "event") return <EventRow block={block} delay={delay} isToday={props.isToday} nowMin={props.nowMin} />;
  if (block.kind === "break") {
    return (
      <div className="td-row is-break" style={{ animationDelay: `${delay}ms` }}>
        <span className="td-time">{formatTime(block.start)}</span>
        <span className="td-lead">
          <Coffee size={14} aria-hidden="true" />
        </span>
        <span className="td-title">Break · {formatDuration(block.end - block.start)}</span>
      </div>
    );
  }
  return <TaskRow {...props} />;
}

function EventRow({ block, delay, isToday, nowMin }: { block: PlannedBlock; delay: number; isToday: boolean; nowMin: number }) {
  const e = block.event!;
  const color = useStore((s) => s.calendars.find((c) => c.id === e.calendarId)?.color ?? "var(--work)");
  const calName = useStore((s) => s.calendars.find((c) => c.id === e.calendarId)?.name ?? "Calendar");
  const isNow = isToday && block.start <= nowMin && nowMin < block.end;
  return (
    <div className={`td-row is-event${isNow ? " is-now" : ""}`} style={{ animationDelay: `${delay}ms` }} title={[calName, e.location].filter(Boolean).join(" · ")}>
      <span className="td-time">{formatTime(block.start)}</span>
      <span className="td-lead">
        <span className="mark-event" style={{ background: color }} aria-hidden="true" />
      </span>
      <span className="td-title truncate">{e.title}</span>
      <span className="td-signals">
        {isNow && <span className="sig now">Now</span>}
        <span className="sig len">until {formatTime(block.end)}</span>
      </span>
    </div>
  );
}

function TaskRow({ block, nowMin, isToday, delay, date, selected, onSelect, onOpen }: RowProps) {
  const task = block.task!;
  const { toggleDone, updateTask, deleteTask, moveTasks } = useStore.getState();
  const toast = useToast((s) => s.show);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  const isNow = isToday && !task.done && block.start <= nowMin && nowMin < block.end;
  const source = SOURCE[task.source];
  const go = useNav((s) => s.go);
  const openSource =
    task.sourceRef && task.source === "email"
      ? () => go("inbox", { kind: "email", id: task.sourceRef! })
      : task.sourceRef && task.source === "note"
        ? () => go("notes", { kind: "note", id: task.sourceRef! })
        : null;

  const save = () => {
    const t = draft.trim();
    if (t && t !== task.title) updateTask(task.id, { title: t });
    else setDraft(task.title);
    setEditing(false);
  };

  return (
    <div
      id={`task-${task.id}`}
      className={`td-row is-task${isNow ? " is-now" : ""}${task.done ? " is-done" : ""}${selected ? " is-selected" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
      onMouseDown={() => onSelect(task.id)}
    >
      <span className="td-time">{formatTime(block.start)}</span>
      <span className="td-lead">
        <CheckButton checked={task.done} label={task.done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`} onToggle={() => toggleDone(task.id, block.start)} />
      </span>
      {editing ? (
        <input
          className="td-title-input"
          aria-label="Task name"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setDraft(task.title);
              setEditing(false);
            }
          }}
        />
      ) : (
        <span className="td-title truncate" onClick={() => onOpen(task.id)} onDoubleClick={() => !task.done && setEditing(true)} title="Click for details · double-click to rename">
          {task.title}
        </span>
      )}
      {/* Calm by default: only signals that change what you do. Everything else is in the details. */}
      <span className="td-signals">
        {!!task.checklist?.length && !task.done && (
          <span className="sig">
            {task.checklist.filter((c) => c.done).length}/{task.checklist.length}
          </span>
        )}
        {(task.priority === "urgent" || task.priority === "high") && !task.done && <PriorityIcon priority={task.priority} size={14} />}
        {task.due && !task.done && task.due <= date && <span className="sig due">{dueLabel(task.due, date)}</span>}
        {openSource && source && (
          <button type="button" className="sig-btn" onClick={openSource} title={source.label} aria-label={source.label}>
            <source.icon size={12} />
          </button>
        )}
        {isNow && <span className="sig now">Now</span>}
        <span className="sig len">{formatDuration(task.duration)}</span>
      </span>
      {!task.done && (
        <span className="td-actions">
          <button type="button" className="icon-btn" aria-label="15 minutes shorter" title="15 min shorter" onClick={() => updateTask(task.id, { duration: Math.max(5, task.duration - 15) })}>
            <Minus size={15} />
          </button>
          <button type="button" className="icon-btn" aria-label="15 minutes longer" title="15 min longer" onClick={() => updateTask(task.id, { duration: task.duration + 15 })}>
            <Plus size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={task.fixed ? "Let Tally schedule it" : "Pin to this time"}
            title={task.fixed ? "Unpin: let Tally schedule it" : "Pin to this time"}
            onClick={() => updateTask(task.id, task.fixed ? { fixed: false, start: null } : { fixed: true, start: block.start })}
          >
            {task.fixed ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Move to tomorrow"
            title="Move to tomorrow"
            onClick={() => {
              moveTasks([task.id], tomorrowOf(date));
              toast("Moved to tomorrow");
            }}
          >
            <ArrowRight size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Delete"
            title="Delete"
            onClick={() => {
              deleteTask(task.id);
              toast("Task deleted", { label: "Undo", run: restoreDeletedTask });
            }}
          >
            <Trash2 size={15} />
          </button>
        </span>
      )}
    </div>
  );
}
