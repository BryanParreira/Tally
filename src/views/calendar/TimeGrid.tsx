import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, MapPin } from "lucide-react";
import { formatTime, fromKey } from "../../lib/date";
import { clamp, layoutLanes, snap } from "../../lib/calendarGrid";
import type { CalItem } from "./items";

export const HOUR = 48;
const DRAG_THRESHOLD = 4;

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
  onCreate(date: string, start: number, end: number, anchor: Anchor): void;
  onSelect(item: CalItem, anchor: Anchor): void;
  onMove(item: CalItem, date: string, start: number): void;
  onResize(item: CalItem, end: number): void;
  onOpenDay(date: string): void;
}

type Drag =
  | { type: "create"; col: number; from: number; to: number }
  | { type: "move"; item: CalItem; col: number; startY: number; startX: number; offset: number; moved: boolean; previewCol: number; previewStart: number }
  | { type: "resize"; item: CalItem; startY: number; previewEnd: number };

const minuteAt = (y: number) => clamp((y / HOUR) * 60, 0, 1440);

/** Day and week views: a 24-hour grid where you drag to create, move and resize. */
export function TimeGrid({ days, items, today, nowMin, selectedKey, scrollNonce, onCreate, onSelect, onMove, onResize, onOpenDay }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const cols = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  // Open at the current time (or the start of a normal day).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const focus = days.includes(today) ? nowMin - 90 : 7 * 60 + 30;
    el.scrollTop = Math.max(0, (focus / 60) * HOUR);
  }, [scrollNonce, days.length]);

  const colAt = (clientX: number): number => {
    const rects = cols.current.map((c) => c?.getBoundingClientRect());
    const i = rects.findIndex((r) => r && clientX >= r.left && clientX < r.right);
    if (i >= 0) return i;
    return clientX < (rects[0]?.left ?? 0) ? 0 : days.length - 1;
  };
  const yIn = (clientY: number, col: number) => clientY - (cols.current[col]?.getBoundingClientRect().top ?? 0);

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.type === "create") {
        setDrag({ ...d, to: snap(minuteAt(yIn(e.clientY, d.col))) });
      } else if (d.type === "move") {
        const moved = d.moved || Math.abs(e.clientY - d.startY) > DRAG_THRESHOLD || Math.abs(e.clientX - d.startX) > DRAG_THRESHOLD;
        if (!moved) return;
        const col = colAt(e.clientX);
        const length = d.item.end - d.item.start;
        const start = clamp(snap(minuteAt(yIn(e.clientY, col)) - d.offset), 0, 1440 - length);
        setDrag({ ...d, moved, previewCol: col, previewStart: start });
      } else {
        const end = clamp(snap(minuteAt(yIn(e.clientY, days.indexOf(d.item.date)))), d.item.start + 15, 1440);
        setDrag({ ...d, previewEnd: end });
      }
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      if (d.type === "create") {
        let [a, b] = d.from <= d.to ? [d.from, d.to] : [d.to, d.from];
        if (b - a < 15) b = a + 60;
        onCreate(days[d.col], a, Math.min(b, 1440), { x: e.clientX, y: e.clientY });
      } else if (d.type === "move") {
        if (!d.moved) onSelect(d.item, { x: e.clientX, y: e.clientY });
        else if (d.previewStart !== d.item.start || days[d.previewCol] !== d.item.date) onMove(d.item, days[d.previewCol], d.previewStart);
      } else if (d.previewEnd !== d.item.end) {
        onResize(d.item, d.previewEnd);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag !== null]);

  const startCreate = (e: ReactPointerEvent<HTMLDivElement>, col: number) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    e.preventDefault();
    const m = Math.floor(minuteAt(yIn(e.clientY, col)) / 15) * 15;
    setDrag({ type: "create", col, from: m, to: m + 30 });
  };

  const startMove = (e: ReactPointerEvent, item: CalItem, col: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!item.editable) {
      onSelect(item, { x: e.clientX, y: e.clientY });
      return;
    }
    const offset = minuteAt(yIn(e.clientY, col)) - item.start;
    setDrag({ type: "move", item, col, startY: e.clientY, startX: e.clientX, offset, moved: false, previewCol: col, previewStart: item.start });
  };

  const startResize = (e: ReactPointerEvent, item: CalItem) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setDrag({ type: "resize", item, startY: e.clientY, previewEnd: item.end });
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
              <span key={h} className="tg-hour" style={{ top: y(h) }}>
                {formatTime(h).replace(":00", "")}
              </span>
            ))}
          </div>
          {days.map((d, col) => {
            const list = (items.get(d) ?? []).filter((i) => !i.allDay);
            // While moving, show the item in its new place.
            const shown = list.filter((i) => !(drag?.type === "move" && drag.moved && drag.item.key === i.key));
            const ghost =
              drag?.type === "move" && drag.moved && drag.previewCol === col
                ? { ...drag.item, date: d, start: drag.previewStart, end: drag.previewStart + (drag.item.end - drag.item.start) }
                : null;
            const sized = shown.map((i) => (drag?.type === "resize" && drag.item.key === i.key ? { ...i, end: drag.previewEnd } : i));
            const lanes = layoutLanes(sized);
            return (
              <div key={d} ref={(el) => {
                  cols.current[col] = el;
                }} className={`tg-col${d === today ? " is-today" : ""}`} onPointerDown={(e) => startCreate(e, col)}>
                {hours.map((h) => (
                  <span key={h} className="tg-line" style={{ top: y(h) }} />
                ))}
                {sized.map((it) => {
                  const pos = lanes.get(it)!;
                  return <Block key={it.key} item={it} lane={pos} y={y} selected={selectedKey === it.key} onPointerDown={(e) => startMove(e, it, col)} onResizeStart={(e) => startResize(e, it)} />;
                })}
                {ghost && <Block item={ghost} lane={{ lane: 0, of: 1 }} y={y} selected ghost onPointerDown={() => undefined} onResizeStart={() => undefined} />}
                {drag?.type === "create" && drag.col === col && (
                  <div className="tg-draft" style={{ top: y(Math.min(drag.from, drag.to)), height: Math.max(12, y(Math.abs(drag.to - drag.from) || 30)) }}>
                    {formatTime(Math.min(drag.from, drag.to))} – {formatTime(Math.max(drag.from, drag.to) || drag.from + 30)}
                  </div>
                )}
                {d === today && <span className="tg-now" style={{ top: y(nowMin) }} />}
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
  lane: { lane: number; of: number };
  y(m: number): number;
  selected: boolean;
  ghost?: boolean;
  onPointerDown(e: ReactPointerEvent): void;
  onResizeStart(e: ReactPointerEvent): void;
}

function Block({ item, lane, y, selected, ghost, onPointerDown, onResizeStart }: BlockProps) {
  const height = Math.max(18, y(item.end) - y(item.start) - 2);
  const size = height < 34 ? " is-short" : height < 54 ? " is-small" : "";
  const cls = [
    "tg-block",
    item.kind === "task" ? "is-task" : "is-event",
    item.done ? "is-done" : "",
    item.planned ? "is-planned" : "",
    selected ? "is-selected" : "",
    ghost ? "is-ghost" : "",
    item.editable ? "is-editable" : "",
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
        width: `calc(${100 / lane.of}% - ${lane.of > 1 ? 4 : 10}px)`,
        ["--c" as string]: item.color,
      }}
      onPointerDown={onPointerDown}
      role="button"
      tabIndex={0}
      aria-label={`${item.title}, ${formatTime(item.start)} to ${formatTime(item.end)}`}
    >
      <span className="tg-block-title">
        {item.kind === "task" && (
          <span className={`tg-check${item.done ? " is-on" : ""}`} aria-hidden="true">
            {item.done && <Check size={9} strokeWidth={3.5} />}
          </span>
        )}
        {item.title}
      </span>
      <span className="tg-block-meta">
        {formatTime(item.start)}
        {size !== " is-short" && <> – {formatTime(item.end)}</>}
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
