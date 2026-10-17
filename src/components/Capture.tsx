import { forwardRef, useMemo, useState } from "react";
import { ArrowUp, Clock, CalendarDays, Flag, Plus } from "lucide-react";
import { parseBrainDump } from "../lib/parse";
import { dueLabel, formatDay, formatDuration, formatTime } from "../lib/date";
import { useStore } from "../lib/store";
import { useToast } from "../lib/hooks";
import { CATEGORY_LABEL } from "./ui";

const EXAMPLES = [
  "finish history essay by friday, gym at 6pm, call mom",
  "study bio chapter 4 for 2h, reply to Sam, groceries",
  "team sync at 1:30 for 15 min, send the report by tomorrow",
  "read 20 pages, laundry, plan next week for 20 min",
];

export const Capture = forwardRef<HTMLInputElement, { date: string; today: string }>(function Capture({ date, today }, ref) {
  const [text, setText] = useState("");
  const planDump = useStore((s) => s.planDump);
  const toast = useToast((s) => s.show);
  const placeholder = useMemo(() => `Add tasks, e.g. "${EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]}"`, []);
  const preview = useMemo(() => (text.trim() ? parseBrainDump(text, date) : []), [text, date]);

  const submit = () => {
    if (!preview.length) return;
    const n = planDump(text, date);
    setText("");
    toast(n === 1 ? "Added to your plan" : `Planned ${n} things for you`);
  };

  return (
    <div className="capture">
      <div className="capture-row">
        <Plus size={16} color="var(--ink-3)" aria-hidden="true" />
        <label htmlFor="capture" className="sr-only">
          Brain dump
        </label>
        <input
          id="capture"
          ref={ref}
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") setText("");
          }}
        />
        <button type="button" className="btn primary" style={{ width: 30, height: 30, padding: 0 }} aria-label="Plan it" disabled={!preview.length} onClick={submit}>
          <ArrowUp size={18} strokeWidth={2.4} />
        </button>
      </div>
      {preview.length > 0 && (
        <div className="capture-preview" aria-live="polite">
          {preview.map((p, i) => (
            <span className="preview-chip" key={i}>
              <span className={`dot ${p.category}`} aria-hidden="true" />
              <strong style={{ fontWeight: 600 }}>{p.title}</strong>
              <span className="meta">{CATEGORY_LABEL[p.category]}</span>
              <span className="meta row" style={{ gap: 4 }}>
                <Clock size={12} aria-hidden="true" />
                {p.start !== null ? formatTime(p.start) : formatDuration(p.duration)}
              </span>
              {p.date && p.date !== date && (
                <span className="meta row" style={{ gap: 4 }}>
                  <CalendarDays size={12} aria-hidden="true" />
                  {formatDay(p.date, today)}
                </span>
              )}
              {p.due && (
                <span className="meta row" style={{ gap: 4 }}>
                  <Flag size={12} aria-hidden="true" />
                  {dueLabel(p.due, today)}
                </span>
              )}
            </span>
          ))}
          <span className="hint row" style={{ gap: 6, marginLeft: "auto" }}>
            <span className="kbd">Enter</span> to plan
          </span>
        </div>
      )}
    </div>
  );
});
