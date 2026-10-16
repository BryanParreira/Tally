import { formatTime, fromKey } from "../../lib/date";
import { monthMatrix, sameMonth } from "../../lib/calendarGrid";
import type { Anchor } from "./TimeGrid";
import type { CalItem } from "./items";

const MAX_ROWS = 3;
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

interface Props {
  anchor: string;
  today: string;
  items: Map<string, CalItem[]>;
  selectedKey: string | null;
  onCreate(date: string, anchor: Anchor): void;
  onSelect(item: CalItem, anchor: Anchor): void;
  onOpenDay(date: string): void;
}

/** Month view: six calm weeks, up to three items a day, the rest one click away. */
export function MonthGrid({ anchor, today, items, selectedKey, onCreate, onSelect, onOpenDay }: Props) {
  const weeks = monthMatrix(anchor);
  const names = WEEKDAYS.map((wd) => new Date(2026, 0, 4 + wd).toLocaleDateString(undefined, { weekday: "short" }));

  return (
    <div className="mg">
      <div className="mg-head">
        {names.map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <div className="mg-body">
        {weeks.flat().map((d) => {
          const list = [...(items.get(d) ?? [])].sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
          const extra = list.length - MAX_ROWS;
          return (
            <div
              key={d}
              className={`mg-cell${sameMonth(d, anchor) ? "" : " is-out"}${d === today ? " is-today" : ""}`}
              onClick={(e) => e.target === e.currentTarget && onCreate(d, { x: e.clientX, y: e.clientY })}
            >
              <button type="button" className="mg-date" onClick={() => onOpenDay(d)} aria-label={`Open ${fromKey(d).toDateString()}`}>
                {fromKey(d).getDate() === 1 ? fromKey(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : fromKey(d).getDate()}
              </button>
              {list.slice(0, extra > 0 ? MAX_ROWS - 1 : MAX_ROWS).map((it) => (
                <button
                  key={it.key}
                  type="button"
                  className={`mg-item${it.allDay ? " is-allday" : ""}${it.done ? " is-done" : ""}${selectedKey === it.key ? " is-selected" : ""}`}
                  style={{ ["--c" as string]: it.color }}
                  onClick={(e) => onSelect(it, { x: e.clientX, y: e.clientY })}
                >
                  {!it.allDay && <span className="mg-dot" aria-hidden="true" />}
                  {!it.allDay && <span className="mg-time">{formatTime(it.start).replace(":00", "").replace(" ", "").toLowerCase()}</span>}
                  <span className="truncate">{it.title}</span>
                </button>
              ))}
              {extra > 0 && (
                <button type="button" className="mg-more" onClick={() => onOpenDay(d)}>
                  {extra + 1} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
