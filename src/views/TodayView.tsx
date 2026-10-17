import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarClock, ChevronLeft, ChevronRight, Copy, Moon, Sun } from "lucide-react";
import { Capture } from "../components/Capture";
import { NowCard } from "../components/NowCard";
import { InboxOverview } from "../components/InboxBrief";
import { ComingUp } from "../components/ComingUp";
import { TaskDetail } from "../components/TaskDetail";
import { Timeline } from "../components/Timeline";
import { CategoryTag, CheckButton, Modal } from "../components/ui";
import { addDays, dueLabel, formatDay, formatDuration, formatLongDate, minutesOfDay } from "../lib/date";
import { useNow, useToast } from "../lib/hooks";
import { isTyping, reveal, useNav } from "../lib/nav";
import { planFor, tomorrowOf, useStore } from "../lib/store";
import { eventsOn } from "../lib/ics";
import { formatAvailability, freeSlots, nextDays, type Busy } from "../lib/availability";
import { planCandidates } from "../lib/taskViews";
import type { Priority, Task } from "../lib/types";

export function TodayView({ todayKey }: { todayKey: string }) {
  const [date, setDate] = useState(todayKey);
  const [wrapUp, setWrapUp] = useState(false);
  const [freeTime, setFreeTime] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [plannedOn, setPlannedOn] = useState(readPlanned);
  const calendars = useStore((s) => s.calendars);
  const [selected, setSelected] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const captureNonce = useNav((s) => s.captureNonce);
  const target = useNav((s) => s.target);
  const now = useNow(15000);
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const events = useStore((s) => s.events);
  const moveTasks = useStore((s) => s.moveTasks);
  const toast = useToast((s) => s.show);

  const isToday = date === todayKey;
  const nowMin = minutesOfDay(now);
  const plan = useMemo(() => planFor({ tasks, settings, events }, date, now), [tasks, settings, events, date, now]);

  // "c", the tray menu and the global shortcut all land here.
  useEffect(() => {
    if (captureNonce) {
      setDate(todayKey);
      setTimeout(() => captureRef.current?.focus(), 30);
    }
  }, [captureNonce, todayKey]);

  // Arriving from a link or the command menu: open the right day and show the task.
  useEffect(() => {
    if (target?.kind !== "task") return;
    const t = useStore.getState().tasks.find((x) => x.id === target.id);
    if (!t) return;
    setDate(t.date);
    setSelected(t.id);
    reveal(`task-${t.id}`);
  }, [target]);

  // j/k to move, e to toggle done, p for priority, Enter for details.
  const order = plan.blocks.filter((b) => b.kind === "task" && b.task).map((b) => b.task!);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || useNav.getState().palette || document.querySelector(".modal")) return;
      const i = order.findIndex((t) => t.id === selected);
      if (e.key === "j" || e.key === "ArrowDown" || e.key === "k" || e.key === "ArrowUp") {
        if (!order.length) return;
        e.preventDefault();
        const down = e.key === "j" || e.key === "ArrowDown";
        const nextIndex = i < 0 ? 0 : Math.min(order.length - 1, Math.max(0, i + (down ? 1 : -1)));
        setSelected(order[nextIndex].id);
        reveal(`task-${order[nextIndex].id}`);
      } else if ((e.key === "e" || e.key === "x") && i >= 0) {
        const b = plan.blocks.find((x) => x.task?.id === selected);
        useStore.getState().toggleDone(order[i].id, b?.start ?? null);
      } else if (e.key === "p" && i >= 0 && !order[i].done) {
        const cycle: Priority[] = ["normal", "high", "urgent", "low"];
        const nextP = cycle[(cycle.indexOf(order[i].priority ?? "normal") + 1) % cycle.length];
        useStore.getState().updateTask(order[i].id, { priority: nextP });
        toast(`Priority: ${nextP}`);
      } else if (e.key === "Enter" && i >= 0) {
        e.preventDefault();
        setOpenTask(order[i].id);
      } else if (e.key === "Escape") {
        if (openTask) setOpenTask(null);
        else setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const dayTasks = tasks.filter((t) => t.date === date && !t.someday);
  const doneCount = dayTasks.filter((t) => t.done).length;
  const eventCount = plan.blocks.filter((b) => b.kind === "event").length;
  const eveningSoon = isToday && nowMin >= settings.dayEnd - 60;
  const picks = useMemo(() => planCandidates(tasks, todayKey), [tasks, todayKey]);
  const showPlan = isToday && plannedOn !== todayKey && !eveningSoon && picks.length > 0;

  // One quiet line of facts under the title.
  const facts = [
    formatLongDate(date),
    dayTasks.length ? `${doneCount} of ${dayTasks.length} done` : "",
    eventCount ? `${eventCount} ${eventCount === 1 ? "event" : "events"}` : "",
    isToday && plan.remaining ? `${formatShort(plan.remaining)} planned` : "",
  ].filter(Boolean);
  const allDay = eventsOn(events, date).filter((e) => e.allDay);

  return (
    <div className="today-split">
      <div className="today-main">
        <div className="today-inner">
          <header className="page-head today-head">
            <div>
              <h1 className="title">{isToday ? "Today" : formatDay(date, todayKey)}</h1>
              <p className="subtitle">{facts.join(" · ")}</p>
            </div>
            <div className="row head-tools">
              {showPlan && (
                <button type="button" className="btn sm ghost" onClick={() => setPlanning(true)} title="Pick what to bring into today">
                  <Sun size={14} /> Plan my day
                </button>
              )}
              {isToday && dayTasks.length > 0 && (
                <button type="button" className={`btn sm${eveningSoon ? " primary" : " ghost"}`} onClick={() => setWrapUp(true)} title="Close out today and plan tomorrow">
                  <Moon size={14} /> Wrap up
                </button>
              )}
              <button type="button" className="icon-btn" onClick={() => setFreeTime(true)} title="Copy your free time" aria-label="Copy your free time">
                <CalendarClock size={16} />
              </button>
              <div className="daynav">
                <button type="button" className="icon-btn" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
                  <ChevronLeft size={16} />
                </button>
                <button type="button" className="btn ghost sm label" onClick={() => setDate(todayKey)} aria-label="Go to today">
                  {formatDay(date, todayKey)}
                </button>
                <button type="button" className="icon-btn" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </header>



          <div className="today-grid2">
            <div className="today-col">
              {allDay.length > 0 && (
                <div className="allday-line" aria-label="All-day events">
                  {allDay.map((e) => (
                    <span key={e.uid} className="allday-item">
                      <span className="dot" style={{ background: calendars.find((c) => c.id === e.calendarId)?.color ?? "var(--work)" }} aria-hidden="true" />
                      <span className="truncate">{e.title}</span>
                    </span>
                  ))}
                </div>
              )}

              {isToday && <NowCard plan={plan} nowMin={nowMin} calendars={calendars} />}

              <Capture ref={captureRef} date={date} today={todayKey} />

              <div className="today-list">
                <Timeline
                  plan={plan}
                  date={date}
                  today={todayKey}
                  nowMin={nowMin}
                  isToday={isToday}
                  selected={selected}
                  onSelect={setSelected}
                  onOpen={(id) => {
                    setSelected(id);
                    setOpenTask(id);
                  }}
                />
              </div>

              {plan.overflow.length > 0 && (
                <details className="overflow">
                  <summary>
                    <span>
                      {plan.overflow.length} {plan.overflow.length === 1 ? "task doesn't" : "tasks don't"} fit {isToday ? "today" : "this day"}
                    </span>
                    <span className="spacer" />
                    <button
                      type="button"
                      className="btn sm"
                      onClick={(e) => {
                        e.preventDefault();
                        moveTasks(
                          plan.overflow.map((t) => t.id),
                          tomorrowOf(date),
                        );
                        toast("Moved to tomorrow");
                      }}
                    >
                      Move to tomorrow <ArrowRight size={13} />
                    </button>
                  </summary>
                  {plan.overflow.map((t) => (
                    <button type="button" className="overflow-row" key={t.id} onClick={() => (setSelected(t.id), setOpenTask(t.id))}>
                      <span className={`dot ${t.category}`} aria-hidden="true" />
                      <span className="truncate" style={{ flex: 1 }}>
                        {t.title}
                      </span>
                      <span className="muted small">{formatDuration(t.duration)}</span>
                    </button>
                  ))}
                </details>
              )}
            </div>

            <aside className="today-side" aria-label="Overview">
              <InboxOverview />
              <ComingUp plan={plan} date={date} today={todayKey} nowMin={isToday ? nowMin : -1} />
            </aside>
          </div>
        </div>
      </div>

      {openTask && (
        <div className="drawer">
          <TaskDetail taskId={openTask} onClose={() => setOpenTask(null)} />
        </div>
      )}
      {planning && (
        <PlanDay
          today={todayKey}
          picks={picks}
          onClose={(planned) => {
            setPlanning(false);
            if (planned) {
              writePlanned(todayKey);
              setPlannedOn(todayKey);
            }
          }}
        />
      )}
      {freeTime && <FreeTime todayKey={todayKey} onClose={() => setFreeTime(false)} />}
      {wrapUp && <WrapUp date={date} onClose={() => setWrapUp(false)} onPlanTomorrow={() => setDate(tomorrowOf(todayKey))} />}
    </div>
  );
}

const PLANNED_KEY = "kindred.plannedOn";
function readPlanned(): string | null {
  try {
    return localStorage.getItem(PLANNED_KEY);
  } catch {
    return null;
  }
}
function writePlanned(day: string) {
  try {
    localStorage.setItem(PLANNED_KEY, day);
  } catch {
    /* only hides the button for the day */
  }
}

/** A short morning check: tick what you'll do today. Nothing is moved until you say so. */
function PlanDay({ today, picks, onClose }: { today: string; picks: { group: "due" | "backlog"; task: Task }[]; onClose: (planned: boolean) => void }) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(picks.filter((p) => p.group === "due" && p.task.due! <= addDays(today, 1)).map((p) => p.task.id)));
  const toast = useToast((s) => s.show);
  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const groups = [
    { key: "due", label: "Due soon", items: picks.filter((p) => p.group === "due") },
    { key: "backlog", label: "From your backlog", items: picks.filter((p) => p.group === "backlog") },
  ].filter((g) => g.items.length);

  return (
    <Modal onClose={() => onClose(false)} labelledBy="plan-title">
      <h2 id="plan-title">Plan your day</h2>
      <p className="muted" style={{ margin: "0 0 16px" }}>
        Tick what you want to get to today. Kindred fits it around your calendar.
      </p>
      {groups.map((g) => (
        <div key={g.key} className="plan-group">
          <h3 className="section">{g.label}</h3>
          {g.items.map(({ task }) => (
            <div key={task.id} className="plan-row" onClick={() => toggle(task.id)}>
              {/* The click bubbles to the row, which does the toggling. */}
              <CheckButton checked={chosen.has(task.id)} onToggle={() => undefined} label={`Bring "${task.title}" into today`} />
              <span className="truncate" style={{ flex: 1 }}>
                {task.title}
              </span>
              <span className="muted small">{task.due ? dueLabel(task.due, today) : formatDuration(task.duration)}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
        <button type="button" className="btn ghost" onClick={() => onClose(true)}>
          Not today
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            const { updateTask } = useStore.getState();
            chosen.forEach((id) => updateTask(id, { date: today, someday: undefined, start: null, fixed: false }));
            toast(chosen.size ? `Added ${chosen.size} to today` : "Your day is set");
            onClose(true);
          }}
        >
          {chosen.size ? `Add ${chosen.size} to today` : "Done"}
        </button>
      </div>
    </Modal>
  );
}

function formatShort(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

/** Open time over the next few working days, ready to paste into an email. */
function FreeTime({ todayKey, onClose }: { todayKey: string; onClose: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const events = useStore((s) => s.events);
  const settings = useStore((s) => s.settings);
  const toast = useToast((s) => s.show);
  const [days, setDays] = useState(3);
  const tz =
    Intl.DateTimeFormat(undefined, { timeZoneName: "long" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value ?? "local time";

  const text = useMemo(() => {
    const nowMin = minutesOfDay(new Date());
    const list = nextDays(todayKey, days, true).map((d) => {
      const busy: Busy[] = [
        ...eventsOn(events, d).filter((e) => !e.allDay),
        ...tasks.filter((t) => t.date === d && t.fixed && t.start !== null && !t.done).map((t) => ({ start: t.start!, end: t.start! + t.duration })),
      ];
      return { date: d, slots: freeSlots(busy, settings, d === todayKey ? nowMin + 30 : 0) };
    });
    return formatAvailability(list, todayKey, tz);
  }, [tasks, events, settings, todayKey, days, tz]);
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);

  return (
    <Modal onClose={onClose} labelledBy="free-title">
      <h2 id="free-title">Your free time</h2>
      <p className="muted" style={{ margin: "0 0 14px" }}>
        Built from your calendar and pinned tasks. Flexible tasks aren't counted because Kindred plans around new meetings.
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="label">Next</span>
        {[3, 5, 7].map((n) => (
          <button key={n} type="button" className={`btn sm${days === n ? " primary" : ""}`} onClick={() => setDays(n)}>
            {n} days
          </button>
        ))}
      </div>
      <label htmlFor="free-text" className="sr-only">
        Availability
      </label>
      <textarea id="free-text" className="input" style={{ minHeight: 170 }} value={draft} onChange={(e) => setDraft(e.target.value)} />
      <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(draft);
              toast("Copied. Paste it into your reply");
              onClose();
            } catch {
              toast("Select the text and copy it");
            }
          }}
        >
          <Copy size={15} /> Copy
        </button>
      </div>
    </Modal>
  );
}

function WrapUp({ date, onClose, onPlanTomorrow }: { date: string; onClose: () => void; onPlanTomorrow: () => void }) {
  const allTasks = useStore((s) => s.tasks);
  const tasks = allTasks.filter((t) => t.date === date);
  const moveTasks = useStore((s) => s.moveTasks);
  const done = tasks.filter((t) => t.done);
  const open = tasks.filter((t) => !t.done);
  const toast = useToast((s) => s.show);

  return (
    <Modal onClose={onClose} labelledBy="wrapup-title">
      <h2 id="wrapup-title">{done.length ? "Nice work today" : "Today's wrap-up"}</h2>
      <p className="muted" style={{ margin: "0 0 18px" }}>
        You finished {done.length} of {tasks.length} {tasks.length === 1 ? "thing" : "things"}.
      </p>
      {done.length > 0 && (
        <div className="card pad" style={{ marginBottom: 14 }}>
          <h2 className="section">Done</h2>
          <div className="list">
            {done.map((t) => (
              <div className="list-item" key={t.id}>
                <CategoryTag category={t.category} />
                <span className="truncate" style={{ flex: 1 }}>
                  {t.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {open.length > 0 && (
        <div className="card pad" style={{ marginBottom: 18 }}>
          <h2 className="section">Still open. These move to tomorrow</h2>
          <div className="list">
            {open.map((t) => (
              <div className="list-item" key={t.id}>
                <span className={`dot ${t.category}`} aria-hidden="true" />
                <span className="truncate" style={{ flex: 1 }}>
                  {t.title}
                </span>
                <span className="muted small">{formatDuration(t.duration)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost" onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            if (open.length)
              moveTasks(
                open.map((t) => t.id),
                tomorrowOf(date),
              );
            toast("Tomorrow is ready");
            onClose();
            onPlanTomorrow();
          }}
        >
          {open.length ? "Move to tomorrow & see it" : "See tomorrow"}
        </button>
      </div>
    </Modal>
  );
}
