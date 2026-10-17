import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, MapPin, Plus } from "lucide-react";
import { formatDuration, formatTime, fromKey } from "../../lib/date";
import { clamp, layoutLanes, snap, type Lane } from "../../lib/calendarGrid";
import type { CalItem } from "./items";

export const HOUR = 56;
/** Drag data type for a task dragged from a list onto the grid. */
export const TASK_DRAG = "application/x-kindred-task";
/** Blocks are never drawn shorter than this, so a title always fits. */
const MIN_BLOCK = 18;
const DRAG_THRESHOLD = 4;
/** How close (px) to the top or bottom edge a drag has to get before the grid scrolls. */
const EDGE = 56;

export interface Anchor {
  x: number;
  y: number;
}

interface Props {
  days: string[];
  items: Map<string, CalItem[]>;
  today: string;
  nowMin: number;
  selectedKey: string | null;
  /** Bumped by the parent to scroll back to the current time. */
  scrollNonce: number;
  /** A new event being filled in, shown where it will land. */
  pending?: { date: string; start: number; end: number; title: string } | null;
  onCreate(date: string, start: number, end: number, anchor: Anchor): void;
  onSelect(item: CalItem, anchor: Anchor): void;
  onMove(item: CalItem, date: string, start: number): void;
  onResize(item: CalItem, end: number): void;
  onOpenDay(date: string): void;
  /** A task dragged in from a list was dropped at this time. */
  onDropTask?(taskId: string, date: string, start: number): void;
}

type Drag =
  | { type: "create"; col: number; from: number; to: number }
  | { type: "move"; item: CalItem; col: number; startY: number; startX: number; offset: number; moved: boolean; previewCol: number; previewStart: number }
  | { type: "resize"; item: CalItem; startY: number; previewEnd: number };

const minuteAt = (y: number) => clamp((y / HOUR) * 60, 0, 1440);

/** Day and week views: a 24-hour grid where you drag to create, move and resize. */
export function TimeGrid({ days, items, today, nowMin, selectedKey, scrollNonce, pending, onCreate, onSelect, onMove, onResize, onOpenDay, onDropTask }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const cols = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const pointer = useRef({ x: 0, y: 0, fine: false });
  const [hover, setHover] = useState<{ col: number; min: number } | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ col: number; min: number } | null>(null);
  dragRef.current = drag;
  const put = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  // Open at the current time (or the start of a normal day).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const focus = days.includes(today) ? nowMin - 90 : 7 * 60 + 30;
    el.scrollTop = Math.max(0, (focus / 60) * HOUR);
  }, [scrollNonce, days.length]);

  // A dropped item settles into place, then goes back to normal.
  useEffect(() => {
    if (!dropped) return;
    const id = setTimeout(() => setDropped(null), 450);
    return () => clearTimeout(id);
  }, [dropped]);

  const colAt = (clientX: number): number => {
    const rects = cols.current.map((c) => c?.getBoundingClientRect());
    const i = rects.findIndex((r) => r && clientX >= r.left && clientX < r.right);
    if (i >= 0) return i;
    return clientX < (rects[0]?.left ?? 0) ? 0 : days.length - 1;
  };
  const yIn = (clientY: number, col: number) => clientY - (cols.current[col]?.getBoundingClientRect().top ?? 0);

  useEffect(() => {
    if (!drag) return;
    setHover(null);
    // Follow the pointer. Holding Option/Alt snaps to 5 minutes instead of 15.
    const update = () => {
      const d = dragRef.current;
      if (!d) return;
      const { x, y: py, fine } = pointer.current;
      const step = fine ? 5 : 15;
      if (d.type === "create") {
        const to = snap(minuteAt(yIn(py, d.col)), step);
        if (to !== d.to) put({ ...d, to });
      } else if (d.type === "move") {
        const moved = d.moved || Math.abs(py - d.startY) > DRAG_THRESHOLD || Math.abs(x - d.startX) > DRAG_THRESHOLD;
        if (!moved) return;
        const col = colAt(x);
        const length = d.item.end - d.item.start;
        const start = clamp(snap(minuteAt(yIn(py, col)) - d.offset, step), 0, 1440 - length);
        if (!d.moved || start !== d.previewStart || col !== d.previewCol) put({ ...d, moved, previewCol: col, previewStart: start });
      } else {
        const end = clamp(snap(minuteAt(yIn(py, days.indexOf(d.item.date))), step), d.item.start + 15, 1440);
        if (end !== d.previewEnd) put({ ...d, previewEnd: end });
      }
    };
    const move = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY, fine: e.altKey };
      update();
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      put(null);
      if (!d) return;
      if (d.type === "create") {
        let [a, b] = d.from <= d.to ? [d.from, d.to] : [d.to, d.from];
        if (b - a < 15) b = a + 60;
        onCreate(days[d.col], a, Math.min(b, 1440), { x: e.clientX, y: e.clientY });
      } else if (d.type === "move") {
        if (!d.moved) onSelect(d.item, { x: e.clientX, y: e.clientY });
        else if (d.previewStart !== d.item.start || days[d.previewCol] !== d.item.date) {
          const date = days[d.previewCol];
          onMove(d.item, date, d.previewStart);
          setDropped(d.item.kind === "task" ? d.item.key : `e:${d.item.eventUid}:${date}`);
        }
      } else if (d.previewEnd !== d.item.end) {
        onResize(d.item, d.previewEnd);
        setDropped(d.item.key);
      }
    };
    // Escape puts everything back where it was.
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      put(null);
    };
    // Near the top or bottom edge, scroll the day so a drag can reach any hour.
    let raf = 0;
    const tick = () => {
      const el = scroller.current;
      const d = dragRef.current;
      if (el && d && (d.type !== "move" || d.moved)) {
        const r = el.getBoundingClientRect();
        const py = pointer.current.y;
        const over = py < r.top + EDGE ? py - (r.top + EDGE) : py > r.bottom - EDGE ? py - (r.bottom - EDGE) : 0;
        if (over) {
          const before = el.scrollTop;
          el.scrollTop += clamp(over / 3, -16, 16);
          if (el.scrollTop !== before) update();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    window.addEventListener("keydown", key, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key, true);
    };
  }, [drag !== null]);

  const hoverAt = (e: ReactPointerEvent<HTMLDivElement>, col: number) => {
    if (drag || e.pointerType === "touch") return;
    if (e.target !== e.currentTarget) return setHover(null);
    const min = clamp(Math.floor(minuteAt(yIn(e.clientY, col)) / 15) * 15, 0, 1410);
    if (hover?.col !== col || hover.min !== min) setHover({ col, min });
  };

  const startCreate = (e: ReactPointerEvent<HTMLDivElement>, col: number) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    e.preventDefault();
    const m = Math.floor(minuteAt(yIn(e.clientY, col)) / 15) * 15;
    pointer.current = { x: e.clientX, y: e.clientY, fine: e.altKey };
    put({ type: "create", col, from: m, to: m + 30 });
  };

  const startMove = (e: ReactPointerEvent, item: CalItem, col: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!item.editable) {
      onSelect(item, { x: e.clientX, y: e.clientY });
      return;
    }
    const offset = minuteAt(yIn(e.clientY, col)) - item.start;
    pointer.current = { x: e.clientX, y: e.clientY, fine: e.altKey };
    put({ type: "move", item, col, startY: e.clientY, startX: e.clientX, offset, moved: false, previewCol: col, previewStart: item.start });
  };

  const startResize = (e: ReactPointerEvent, item: CalItem) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    pointer.current = { x: e.clientX, y: e.clientY, fine: e.altKey };
    put({ type: "resize", item, startY: e.clientY, previewEnd: item.end });
  };

  const allDay = days.map((d) => (items.get(d) ?? []).filter((i) => i.allDay));
  const hasAllDay = allDay.some((l) => l.length);
  const hours = Array.from({ length: 24 }, (_, h) => h * 60);
  const y = (m: number) => (m / 60) * HOUR;
  const tz = Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value;

  return (
    <div className={`tg${drag ? " is-dragging" : ""}`} style={{ ["--days" as string]: days.length }}>
      <div className="tg-head">
        <div className="tg-gutter tg-tz">{tz}</div>
        {days.map((d, i) => {
          const dt = fromKey(d);
          return (
            <div key={d} className={`tg-dayhead${d === today ? " is-today" : ""}`}>
              <button type="button" className="tg-daybtn" onClick={() => onOpenDay(d)} aria-label={`Open ${dt.toDateString()}`}>
                <span className="wd">{dt.toLocaleDateString(undefined, { weekday: "short" })}</span>
                <span className="dn">{dt.getDate()}</span>
              </button>
              {hasAllDay && (
                <div className="tg-allday">
                  {allDay[i].map((it) => (
                    <button
                      key={it.key}
                      type="button"
                      className={`tg-allday-chip${selectedKey === it.key ? " is-selected" : ""}`}
                      style={{ ["--c" as string]: it.color }}
                      onClick={(e) => onSelect(it, { x: e.clientX, y: e.clientY })}
                    >
                      {it.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="tg-scroll" ref={scroller}>
        <div className="tg-body" style={{ height: 24 * HOUR }}>
          <div className="tg-gutter">
            {hours.slice(1).map((h) => (
              <span key={h} className={`tg-hour${days.includes(today) && Math.abs(h - nowMin) < 14 ? " is-hidden" : ""}`} style={{ top: y(h) }}>
                {formatTime(h).replace(":00", "")}
              </span>
            ))}
            {days.includes(today) && (
              <span className="tg-now-pill" style={{ top: y(nowMin) }}>
                {formatTime(nowMin).replace(/ ?[AP]M$/, "")}
              </span>
            )}
          </div>
          {days.map((d, col) => {
            const list = (items.get(d) ?? []).filter((i) => !i.allDay);
            // While moving, the item leaves an outline behind and a lifted copy follows the pointer.
            const moving = drag?.type === "move" && drag.moved ? drag.item.key : null;
            const resizing = drag?.type === "resize" ? drag.item.key : null;
            const ghost =
              drag?.type === "move" && drag.moved && drag.previewCol === col
                ? { ...drag.item, date: d, start: drag.previewStart, end: drag.previewStart + (drag.item.end - drag.item.start) }
                : null;
            const sized = list.map((i) => (drag?.type === "resize" && drag.item.key === i.key ? { ...i, end: drag.previewEnd } : i));
            const lanes = layoutLanes(sized, ((MIN_BLOCK + 2) / HOUR) * 60);
            return (
              <div key={d} ref={(el) => {
                  cols.current[col] = el;
                }} className={`tg-col${d === today ? " is-today" : ""}${[0, 6].includes(fromKey(d).getDay()) ? " is-weekend" : ""}`}
                onPointerDown={(e) => startCreate(e, col)}
                onPointerMove={(e) => hoverAt(e, col)}
                onPointerLeave={() => setHover(null)}
                onDragOver={(e) => {
                  if (!onDropTask || !e.dataTransfer.types.includes(TASK_DRAG)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const min = clamp(Math.floor(minuteAt(yIn(e.clientY, col)) / 15) * 15, 0, 1410);
                  if (dropAt?.col !== col || dropAt.min !== min) setDropAt({ col, min });
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null);
                }}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData(TASK_DRAG);
                  setDropAt(null);
                  if (!id || !onDropTask) return;
                  e.preventDefault();
                  onDropTask(id, d, clamp(Math.floor(minuteAt(yIn(e.clientY, col)) / 15) * 15, 0, 1410));
                }}>
                {hours.map((h) => (
                  <span key={h} className="tg-line" style={{ top: y(h) }} />
                ))}
                {hours.map((h) => (
                  <span key={`h${h}`} className="tg-line is-half" style={{ top: y(h + 30) }} />
                ))}
                {dropAt?.col === col && (
                  <span className="tg-drop" style={{ top: y(dropAt.min), height: y(30) }} aria-hidden="true">
                    {formatTime(dropAt.min)}
                  </span>
                )}
                {hover?.col === col && !drag && !dropAt && (
                  <span className="tg-hover" style={{ top: y(hover.min), height: y(30) }} aria-hidden="true">
                    <Plus size={11} strokeWidth={2.5} /> {formatTime(hover.min)}
                  </span>
                )}
                {sized.map((it) => {
                  const pos = lanes.get(it)!;
                  return (
                    <Block
                      key={it.key}
                      item={it}
                      lane={pos}
                      y={y}
                      selected={selectedKey === it.key && moving !== it.key}
                      placeholder={moving === it.key}
                      live={resizing === it.key}
                      settling={dropped === it.key}
                      onPointerDown={(e) => startMove(e, it, col)}
                      onResizeStart={(e) => startResize(e, it)}
                    />
                  );
                })}
                {ghost && <Block item={ghost} lane={{ lane: 0, of: 1, span: 1 }} y={y} selected={false} ghost live onPointerDown={() => undefined} onResizeStart={() => undefined} />}
                {ghost && (
                  <span className="tg-drag-label" style={{ top: Math.max(0, y(ghost.start) - 24) }} aria-live="polite">
                    {days.length > 1 && drag?.type === "move" && d !== drag.item.date && `${fromKey(d).toLocaleDateString(undefined, { weekday: "short" })} · `}
                    {formatTime(ghost.start)} – {formatTime(ghost.end)}
                  </span>
                )}
                {drag?.type === "resize" && drag.item.date === d && (
                  <span className="tg-drag-label" style={{ top: y(drag.previewEnd) + 4 }} aria-live="polite">
                    Ends {formatTime(drag.previewEnd)} · {formatDuration(drag.previewEnd - drag.item.start)}
                  </span>
                )}
                {drag?.type === "create" && drag.col === col && (
                  <div className="tg-draft" style={{ top: y(Math.min(drag.from, drag.to)), height: Math.max(18, y(Math.abs(drag.to - drag.from) || 30)) }}>
                    <strong>New event</strong>
                    <span>
                      {formatTime(Math.min(drag.from, drag.to))} – {formatTime(drag.to === drag.from ? drag.from + 30 : Math.max(drag.from, drag.to))}
                    </span>
                  </div>
                )}
                {!drag && pending?.date === d && (
                  <div className="tg-draft is-pending" style={{ top: y(pending.start), height: Math.max(18, y(pending.end) - y(pending.start) - 2) }}>
                    <strong>{pending.title || "New event"}</strong>
                    <span>
                      {formatTime(pending.start)} – {formatTime(pending.end)}
                    </span>
                  </div>
                )}
                {d === today && <span className="tg-now" style={{ top: y(nowMin) }} />}
                {d !== today && days.includes(today) && <span className="tg-now is-other" style={{ top: y(nowMin) }} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface BlockProps {
  item: CalItem;
  lane: Lane;
  y(m: number): number;
  selected: boolean;
  ghost?: boolean;
  /** The outline left behind while the item is being moved. */
  placeholder?: boolean;
  /** Being dragged or resized: always show the full time range. */
  live?: boolean;
  /** Just dropped: settles into place. */
  settling?: boolean;
  onPointerDown(e: ReactPointerEvent): void;
  onResizeStart(e: ReactPointerEvent): void;
}

function Block({ item, lane, y, selected, ghost, placeholder, live, settling, onPointerDown, onResizeStart }: BlockProps) {
  const height = Math.max(MIN_BLOCK, y(item.end) - y(item.start) - 2);
  const size = height < 34 ? " is-short" : height < 54 ? " is-small" : "";
  // Show only whole lines of the title, keeping room for the time underneath.
  const titleLines = size ? 1 : Math.max(1, Math.floor((height - 8 - 15) / 16));
  const last = lane.lane + lane.span >= lane.of;
  // Overlapping items cascade: each reaches a little under its right-hand neighbour, so its title shows above it.
  const reach = last ? lane.span : lane.span + 0.7;
  const cls = [
    "tg-block",
    item.kind === "task" ? "is-task" : "is-event",
    item.done ? "is-done" : "",
    item.planned ? "is-planned" : "",
    selected ? "is-selected" : "",
    ghost ? "is-ghost" : "",
    placeholder ? "is-placeholder" : "",
    live ? "is-live" : "",
    settling ? "is-settling" : "",
    item.editable ? "is-editable" : "",
    titleLines === 1 ? "is-oneline" : "",
    lane.lane > 0 ? "is-stacked" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={cls + size}
      style={{
        top: y(item.start) + 1,
        height,
        left: `calc(${(lane.lane / lane.of) * 100}% + 2px)`,
        width: `calc(${(reach / lane.of) * 100}% - ${last ? 10 : 4}px)`,
        zIndex: selected || ghost ? undefined : 2 + Math.min(lane.lane, 2),
        ["--c" as string]: item.color,
      }}
      onPointerDown={onPointerDown}
      role="button"
      tabIndex={0}
      aria-label={`${item.title}, ${formatTime(item.start)} to ${formatTime(item.end)}`}
    >
      <span className="tg-block-title" style={titleLines > 1 ? { WebkitLineClamp: titleLines } : undefined}>
        {item.kind === "task" && (
          <span className={`tg-check${item.done ? " is-on" : ""}`} aria-hidden="true">
            {item.done && <Check size={9} strokeWidth={3.5} />}
          </span>
        )}
        {item.title}
      </span>
      <span className="tg-block-meta">
        {formatTime(item.start)}
        {(size !== " is-short" || live) && <> – {formatTime(item.end)}</>}
        {item.location && size === "" && (
          <>
            {" "}
            · <MapPin size={10} aria-hidden="true" /> {item.location}
          </>
        )}
      </span>
      {item.editable && !ghost && <span className="tg-resize" onPointerDown={onResizeStart} aria-hidden="true" />}
    </div>
  );
}
