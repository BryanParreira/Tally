import { Fragment, useState } from "react";
import { motion } from "motion/react";
import { spring } from "../lib/motion";
import { ArrowRight, Coffee, Flag, Mail, Pin, PinOff, Plus, Trash2, Minus, GraduationCap, Wand2, NotebookPen } from "lucide-react";
import { dueLabel, formatDay, formatDuration, formatTime } from "../lib/date";
import type { DayPlan, PlannedBlock } from "../lib/schedule";
import { restoreDeletedTask, tomorrowOf, useStore } from "../lib/store";
import type { Task } from "../lib/types";
import { useToast } from "../lib/hooks";
import { useNav } from "../lib/nav";
import { CheckButton } from "./ui";

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
      <div className="empty">
        <span className="glyph">
          <Wand2 size={20} aria-hidden="true" />
        </span>
        <h3>{isToday ? "Your day is wide open" : `Nothing planned for ${formatDay(date, today).toLowerCase()}`}</h3>
        <p>Add a task above, or pick something from your Inbox. Kindred fits it around your calendar, and you can drag it to any time.</p>
      </div>
    );
  }

  const nowIndex = isToday ? blocks.findIndex((b) => b.end > nowMin && !(b.kind === "task" && b.task?.done)) : -1;
  const showLineAt = nowIndex === -1 && isToday ? blocks.length : nowIndex;

  return (
    <div className="timeline">
      {blocks.map((b, i) => (
        <Fragment key={b.task?.id ?? b.event?.uid ?? `break-${b.start}`}>
          {(i === 0 || partOfDay(blocks[i - 1].start) !== partOfDay(b.start)) && <h2 className="section tl-part">{partOfDay(b.start)}</h2>}
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
    <div className="now-line" aria-label={`Now, ${formatTime(nowMin)}`}>
      <span className="t">{formatTime(nowMin).replace(" ", " ")}</span>
      <span className="l" />
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
      <div className="tl-row" style={{ animationDelay: `${delay}ms` }}>
        <div className="tl-time" style={{ paddingTop: 10 }}>
          {formatTime(block.start)}
        </div>
        <div className="break-block">
          <Coffee size={14} aria-hidden="true" />
          Break · {formatDuration(block.end - block.start)} to stretch, drink water and rest your eyes
        </div>
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
    <div className="tl-row" style={{ animationDelay: `${delay}ms` }}>
      <div className="tl-time">{formatTime(block.start)}</div>
      <div className={`block event-block${isNow ? " is-now" : ""}`} style={{ ["--cal" as string]: color }}>
        <span className="mark-event event-dot" aria-hidden="true" />
        <div className="block-body">
          <div className="block-title">{e.title}</div>
          <div className="block-signals" title={[calName, e.location].filter(Boolean).join(" · ")}>
            {isNow && <span className="sig now">Now</span>}
            <span className="sig len">until {formatTime(block.end)}</span>
          </div>
        </div>
      </div>
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
    <div className="tl-row" style={{ animationDelay: `${delay}ms` }}>
      <div className="tl-time">{formatTime(block.start)}</div>
      <div
        id={`task-${task.id}`}
        className={`block${isNow ? " is-now" : ""}${task.done ? " is-done" : ""}${selected ? " is-selected" : ""}`}
        onMouseDown={() => onSelect(task.id)}
      >
        <CheckButton
          checked={task.done}
          label={task.done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
          onToggle={() => toggleDone(task.id, block.start)}
        />
        <div className="block-body">
          {editing ? (
            <input
              className="block-title-input"
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
            <div className="block-title" onClick={() => onOpen(task.id)} onDoubleClick={() => !task.done && setEditing(true)} title="Click for details · double-click to rename">
              {task.title}
            </div>
          )}
          {/* Calm by default: only signals that change what you do. Everything else is in the details. */}
          <div className="block-signals">
            {(task.priority === "urgent" || task.priority === "high") && !task.done && (
              <Flag size={12} className={`sig prio ${task.priority}`} aria-label={task.priority === "urgent" ? "Urgent" : "High priority"} />
            )}
            {task.due && !task.done && task.due <= date && <span className="sig due">{dueLabel(task.due, date)}</span>}
            {openSource && source && (
              <button type="button" className="sig-btn" onClick={openSource} title={source.label} aria-label={source.label}>
                <source.icon size={12} />
              </button>
            )}
            {isNow && <span className="sig now">Now</span>}
            <span className="sig len">{formatDuration(task.duration)}</span>
          </div>
        </div>
        {!task.done && (
          <div className="block-actions">
            <button
              type="button"
              className="icon-btn"
              aria-label="15 minutes shorter"
              title="15 min shorter"
              onClick={() => updateTask(task.id, { duration: Math.max(5, task.duration - 15) })}
            >
              <Minus size={15} />
            </button>
            <button type="button" className="icon-btn" aria-label="15 minutes longer" title="15 min longer" onClick={() => updateTask(task.id, { duration: task.duration + 15 })}>
              <Plus size={15} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={task.fixed ? "Let Kindred schedule it" : "Pin to this time"}
              title={task.fixed ? "Unpin: let Kindred schedule it" : "Pin to this time"}
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
          </div>
        )}
      </div>
    </div>
  );
}
