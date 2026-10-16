import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { TaskDetail } from "../components/TaskDetail";
import { addDays, formatTime, fromKey, minutesOfDay } from "../lib/date";
import { useNow, useToast } from "../lib/hooks";
import { eventsOn } from "../lib/ics";
import { isTyping, useNav } from "../lib/nav";
import { parseItem } from "../lib/parse";
import type { PlannedBlock } from "../lib/schedule";
import { planFor, today, useStore } from "../lib/store";

const HOUR = 52;

/** Monday of the week containing `key`. */
function weekStart(key: string): string {
  const wd = fromKey(key).getDay();
  return addDays(key, -((wd + 6) % 7));
}

/** Side-by-side lanes for overlapping blocks. */
function lanes(blocks: PlannedBlock[]): Map<PlannedBlock, { lane: number; of: number }> {
  const out = new Map<PlannedBlock, { lane: number; of: number }>();
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: PlannedBlock[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const laneEnds: number[] = [];
    const assigned = cluster.map((b) => {
      let lane = laneEnds.findIndex((end) => end <= b.start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = b.end;
      return { b, lane };
    });
    assigned.forEach(({ b, lane }) => out.set(b, { lane, of: laneEnds.length }));
    cluster = [];
  };
  for (const b of sorted) {
    if (b.start >= clusterEnd && cluster.length) flush();
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  if (cluster.length) flush();
  return out;
}

export function CalendarView() {
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const focus = useStore((s) => s.focus);
  const events = useStore((s) => s.events);
  const calendars = useStore((s) => s.calendars);
  const toast = useToast((s) => s.show);
  const now = useNow(60_000);
  const d = today();
  const [start, setStart] = useState(() => weekStart(d));
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ date: string; minute: number } | null>(null);
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const perDay = useMemo(
    () =>
      days.map((date) => ({
        date,
        blocks: planFor({ tasks, settings, focus, events }, date, now).blocks.filter((b) => b.kind !== "break"),
        allDay: eventsOn(events, date).filter((e) => e.allDay),
      })),
    [days, tasks, settings, focus, events, now],
  );

  // Show the whole working day, stretched to fit anything outside it.
  const first = Math.min(settings.dayStart, ...perDay.flatMap((p) => p.blocks.map((b) => b.start)));
  const last = Math.max(settings.dayEnd, ...perDay.flatMap((p) => p.blocks.map((b) => b.end)));
  const gridStart = Math.floor(first / 60) * 60;
  const gridEnd = Math.min(1440, Math.ceil(last / 60) * 60);
  const hours = Array.from({ length: (gridEnd - gridStart) / 60 }, (_, i) => gridStart + i * 60);
  const y = (m: number) => ((m - gridStart) / 60) * HOUR;

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = Math.max(0, y(minutesOfDay(new Date())) - 160);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || useNav.getState().palette || document.querySelector(".modal")) return;
      if (e.key === "ArrowLeft" || e.key === "[") setStart((s) => addDays(s, -7));
      else if (e.key === "ArrowRight" || e.key === "]") setStart((s) => addDays(s, 7));
      else if (e.key === "Escape") {
        setOpen(null);
        setAdding(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const createAt = () => {
    if (!adding) return;
    const item = parseItem(text, adding.date);
    if (!item) return setAdding(null);
    useStore.getState().addTask({ ...item, start: item.start ?? adding.minute, date: item.date ?? adding.date, source: "manual" }, adding.date);
    toast(`Added at ${formatTime(item.start ?? adding.minute)}`);
    setAdding(null);
    setText("");
  };

  const label = (() => {
    const a = fromKey(days[0]);
    const b = fromKey(days[6]);
    const sameMonth = a.getMonth() === b.getMonth();
    const left = a.toLocaleDateString(undefined, { month: "long", day: "numeric" });
    const right = b.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { month: "long", day: "numeric" });
    return `${left} – ${right}, ${b.getFullYear()}`;
  })();
  const nowMin = minutesOfDay(now);

  return (
    <div className="workspace">
      <section className="workspace-main" aria-label="Calendar">
        <header className="toolbar">
          <h1 className="toolbar-title">{label}</h1>
          <span className="spacer" />
          <span className="muted small hide-narrow">
            {calendars.length ? `${calendars.length} ${calendars.length === 1 ? "calendar" : "calendars"} · click a slot to add` : "Click any slot to add a task"}
          </span>
          <div className="daynav">
            <button type="button" className="icon-btn" aria-label="Previous week" onClick={() => setStart(addDays(start, -7))}>
              <ChevronLeft size={16} />
            </button>
            <button type="button" className="btn ghost sm label" onClick={() => setStart(weekStart(d))}>
              This week
            </button>
            <button type="button" className="icon-btn" aria-label="Next week" onClick={() => setStart(addDays(start, 7))}>
              <ChevronRight size={16} />
            </button>
          </div>
        </header>

        <div className={`workspace-body${open ? " with-detail" : ""}`}>
          <div className="cal" ref={scroller}>
            <div className="cal-head">
              <div className="cal-gutter" />
              {perDay.map(({ date, allDay }) => {
                const dt = fromKey(date);
                return (
                  <div key={date} className={`cal-dayhead${date === d ? " is-today" : ""}`}>
                    <button type="button" className="cal-daylabel" onClick={() => useNav.getState().go("today")} title="Open in Today" disabled={date !== d}>
                      <span className="wd">{dt.toLocaleDateString(undefined, { weekday: "short" })}</span>
                      <span className="dn">{dt.getDate()}</span>
                    </button>
                    {allDay.map((e) => (
                      <span key={e.uid} className="cal-allday" style={{ ["--cal" as string]: calendars.find((c) => c.id === e.calendarId)?.color ?? "var(--work)" }}>
                        {e.title}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>

            <div className="cal-grid" style={{ height: hours.length * HOUR }}>
              <div className="cal-gutter">
                {hours.map((h) => (
                  <span key={h} className="cal-hour" style={{ top: y(h) }}>
                    {formatTime(h).replace(":00", "")}
                  </span>
                ))}
              </div>
              {perDay.map(({ date, blocks }) => {
                const layout = lanes(blocks);
                return (
                  <div
                    key={date}
                    className={`cal-col${date === d ? " is-today" : ""}${date < d ? " is-past" : ""}`}
                    onClick={(e) => {
                      if (e.target !== e.currentTarget) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const minute = gridStart + Math.floor(((e.clientY - rect.top) / HOUR) * 4) * 15;
                      setAdding({ date, minute });
                      setText("");
                    }}
                  >
                    {hours.map((h) => (
                      <span key={h} className="cal-line" style={{ top: y(h) }} />
                    ))}
                    {blocks.map((b) => {
                      const pos = layout.get(b)!;
                      // Short blocks get a single line so text never overlaps.
                      const height = y(b.end) - y(b.start);
                      const short = height < 38 ? " is-short" : height < 58 ? " is-small" : "";
                      const style = {
                        top: y(b.start) + 1,
                        height: Math.max(20, y(b.end) - y(b.start) - 2),
                        left: `calc(${(pos.lane / pos.of) * 100}% + 3px)`,
                        width: `calc(${100 / pos.of}% - 6px)`,
                      };
                      if (b.kind === "event") {
                        const color = calendars.find((c) => c.id === b.event!.calendarId)?.color ?? "var(--work)";
                        return (
                          <div key={`e-${b.event!.uid}-${b.start}`} className={`cal-block is-event${short}`} style={{ ...style, ["--cal" as string]: color }} title={b.event!.title}>
                            <span className="cal-block-title">{b.event!.title}</span>
                            <span className="cal-block-time">
                              {formatTime(b.start)}
                              {b.event!.location ? (
                                <>
                                  {" "}
                                  · <MapPin size={10} aria-hidden="true" /> {b.event!.location}
                                </>
                              ) : null}
                            </span>
                          </div>
                        );
                      }
                      const t = b.task!;
                      return (
                        <button
                          key={`t-${t.id}`}
                          type="button"
                          className={`cal-block is-task${short} cat-${t.category}${t.done ? " is-done" : ""}${t.priority === "urgent" ? " is-urgent" : ""}${open === t.id ? " is-open" : ""}`}
                          style={style}
                          onClick={() => setOpen(t.id)}
                          title={t.title}
                        >
                          <span className="cal-block-title">{t.title}</span>
                          <span className="cal-block-time">
                            {short === " is-short" ? formatTime(b.start).replace(/ (AM|PM)$/, "") : formatTime(b.start)}
                            {t.fixed || short ? "" : " · planned"}
                          </span>
                        </button>
                      );
                    })}
                    {date === d && nowMin >= gridStart && nowMin <= gridEnd && <span className="cal-now" style={{ top: y(nowMin) }} />}
                    {adding?.date === date && (
                      <div className="cal-add" style={{ top: y(adding.minute) }}>
                        <span className="small muted">{formatTime(adding.minute)}</span>
                        <input
                          autoFocus
                          aria-label="New task"
                          placeholder="What's happening?"
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          onBlur={() => setTimeout(() => setAdding(null), 120)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") createAt();
                            if (e.key === "Escape") setAdding(null);
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {open && <TaskDetail taskId={open} onClose={() => setOpen(null)} />}
        </div>
      </section>
    </div>
  );
}
