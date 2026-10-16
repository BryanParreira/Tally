import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, fromKey } from "../../lib/date";
import { monthMatrix, sameMonth } from "../../lib/calendarGrid";

interface Props {
  /** The day the main calendar is showing. */
  anchor: string;
  today: string;
  /** Dates currently in view, highlighted as a band. */
  inView: string[];
  /** Days that have something on them get a dot. */
  busy: Set<string>;
  onPick(date: string): void;
}

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function MiniMonth({ anchor, today, inView, busy, onPick }: Props) {
  const [month, setMonth] = useState(anchor.slice(0, 7) + "-01");
  useEffect(() => setMonth(anchor.slice(0, 7) + "-01"), [anchor]);
  const weeks = monthMatrix(month);
  const view = new Set(inView);
  const shift = (n: number) => {
    const d = fromKey(month);
    d.setMonth(d.getMonth() + n);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  };

  return (
    <div className="mini-month" aria-label="Pick a date">
      <div className="mini-head">
        <span className="mini-title">{fromKey(month).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>
          <ChevronLeft size={14} />
        </button>
        <button type="button" className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="mini-grid" role="grid">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="mini-wd" aria-hidden="true">
            {w}
          </span>
        ))}
        {weeks.flat().map((d) => {
          const cls = [
            "mini-day",
            sameMonth(d, month) ? "" : "is-out",
            d === today ? "is-today" : "",
            view.has(d) ? "is-view" : "",
            view.has(d) && !view.has(addDays(d, -1)) ? "is-view-start" : "",
            view.has(d) && !view.has(addDays(d, 1)) ? "is-view-end" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button key={d} type="button" className={cls} onClick={() => onPick(d)} aria-label={fromKey(d).toDateString()} aria-current={d === anchor ? "date" : undefined}>
              {fromKey(d).getDate()}
              {busy.has(d) && <span className="mini-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
