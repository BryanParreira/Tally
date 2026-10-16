import { Fragment, useState } from "react";
import { ArrowRight, Coffee, Mail, Pin, PinOff, Play, Plus, Trash2, Minus, GraduationCap, Wand2, NotebookPen } from "lucide-react";
import { dueLabel, formatDay, formatDuration, formatTime } from "../lib/date";
import type { DayPlan, PlannedBlock } from "../lib/schedule";
import { tomorrowOf, useStore } from "../lib/store";
import type { Task } from "../lib/types";
import { useToast } from "../lib/hooks";
import { useNav } from "../lib/nav";
import { CategoryTag, CheckButton } from "./ui";

interface Props {
  plan: DayPlan;
  date: string;
  today: string;
  nowMin: number;
  isToday: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}

const SOURCE: Partial<Record<Task["source"], { icon: typeof Mail; label: string }>> = {
  email: { icon: Mail, label: "From email" },
  study: { icon: GraduationCap, label: "Study plan" },
  dump: { icon: Wand2, label: "Planned for you" },
  note: { icon: NotebookPen, label: "From a note" },
};

export function Timeline({ plan, date, today, nowMin, isToday, selected, onSelect }: Props) {
  const blocks = plan.blocks;
  if (blocks.length === 0) {
    return (
      <div className="empty">
        <span className="glyph">
          <Wand2 size={20} aria-hidden="true" />
        </span>
        <h3>{isToday ? "Your day is wide open" : `Nothing planned for ${formatDay(date, today).toLowerCase()}`}</h3>
        <p>Type anything into the box above, like tasks, classes or deadlines. Kindred works out the times and fits it all into your day.</p>
      </div>
    );
  }

  const nowIndex = isToday ? blocks.findIndex((b) => b.end > nowMin && !(b.kind === "task" && b.task?.done)) : -1;
  const showLineAt = nowIndex === -1 && isToday ? blocks.length : nowIndex;

  return (
    <div className="timeline">
      {blocks.map((b, i) => (
        <Fragment key={b.task?.id ?? `break-${b.start}`}>
          {isToday && i === showLineAt && !(b.start <= nowMin && nowMin < b.end) && <NowLine nowMin={nowMin} />}
          <Row block={b} nowMin={nowMin} isToday={isToday} delay={Math.min(i, 12) * 25} date={date} selected={!!b.task && b.task.id === selected} onSelect={onSelect} />
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
}

function Row(props: RowProps) {
  const { block, delay } = props;
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

function TaskRow({ block, nowMin, isToday, delay, date, selected, onSelect }: RowProps) {
  const task = block.task!;
  const { toggleDone, updateTask, deleteTask, moveTasks, startFocus } = useStore.getState();
  const focus = useStore((s) => s.focus);
  const toast = useToast((s) => s.show);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  const isNow = isToday && !task.done && block.start <= nowMin && nowMin < block.end;
  const progress = isNow ? (nowMin - block.start) / (block.end - block.start) : 0;
  const focusing = focus?.taskId === task.id;
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
        className={`block${isNow || focusing ? " is-now" : ""}${task.done ? " is-done" : ""}${selected ? " is-selected" : ""}`}
        onMouseDown={() => onSelect(task.id)}
      >
        <CheckButton checked={task.done} label={task.done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`} onToggle={() => toggleDone(task.id, block.start)} />
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
            <div className="block-title" onDoubleClick={() => !task.done && setEditing(true)} title="Double-click to rename">
              {task.title}
            </div>
          )}
          <div className="block-meta">
            <span className="tabular nowrap">
              {formatTime(block.start)} – {formatTime(block.end)} · {formatDuration(task.duration)}
            </span>
            <CategoryTag category={task.category} />
            {task.fixed && (
              <span className="chip" style={{ height: 20, fontSize: 11.5 }}>
                <Pin size={11} aria-hidden="true" /> Fixed time
              </span>
            )}
            {source &&
              !task.fixed &&
              (openSource ? (
                <button type="button" className="chip link-chip" style={{ height: 20, fontSize: 11.5 }} onClick={openSource} title="Open where this came from">
                  <source.icon size={11} aria-hidden="true" /> {source.label}
                </button>
              ) : (
                <span className="chip" style={{ height: 20, fontSize: 11.5 }}>
                  <source.icon size={11} aria-hidden="true" /> {source.label}
                </span>
              ))}
            {task.due && !task.done && (
              <span className="chip brand" style={{ height: 20, fontSize: 11.5 }}>
                {dueLabel(task.due, date)}
              </span>
            )}
            {(isNow || focusing) && (
              <span className="chip brand" style={{ height: 20, fontSize: 11.5 }}>
                {focusing ? "Focusing" : "Now"}
              </span>
            )}
          </div>
        </div>
        {!task.done && (
          <div className="block-actions">
            {isToday && !focusing && (
              <button type="button" className="icon-btn" aria-label="Start focus" title="Start focus" onClick={() => startFocus(task.id)}>
                <Play size={15} />
              </button>
            )}
            <button type="button" className="icon-btn" aria-label="15 minutes shorter" title="15 min shorter" onClick={() => updateTask(task.id, { duration: Math.max(5, task.duration - 15) })}>
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
            <button type="button" className="icon-btn" aria-label="Delete" title="Delete" onClick={() => deleteTask(task.id)}>
              <Trash2 size={15} />
            </button>
          </div>
        )}
        {isNow && !focusing && (
          <div className="block-progress" aria-hidden="true">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
