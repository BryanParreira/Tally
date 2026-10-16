import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, Copy, Inbox, Mail, MapPin, Moon, Plus } from "lucide-react";
import { Capture } from "../components/Capture";
import { DayStrip, NowHero } from "../components/NowCard";
import { TaskDetail } from "../components/TaskDetail";
import { Timeline } from "../components/Timeline";
import { CategoryTag, Modal } from "../components/ui";
import { addDays, formatDay, formatDuration, formatLongDate, formatTime, minutesOfDay } from "../lib/date";
import { greeting, useNow, useToast } from "../lib/hooks";
import { isTyping, reveal, useNav } from "../lib/nav";
import { useMailItems } from "../lib/mailSuggestions";
import { focusElapsed, planFor, tomorrowOf, useStore } from "../lib/store";
import { eventsOn } from "../lib/ics";
import { formatAvailability, freeSlots, nextDays, type Busy } from "../lib/availability";
import type { Priority } from "../lib/types";

export function TodayView({ todayKey }: { todayKey: string }) {
  const [date, setDate] = useState(todayKey);
  const [wrapUp, setWrapUp] = useState(false);
  const [freeTime, setFreeTime] = useState(false);
  const calendars = useStore((s) => s.calendars);
  const [selected, setSelected] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const captureNonce = useNav((s) => s.captureNonce);
  const target = useNav((s) => s.target);
  const go = useNav((s) => s.go);
  const goInbox = () => go("inbox");
  const now = useNow(15000);
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const focus = useStore((s) => s.focus);
  const events = useStore((s) => s.events);
  const name = useStore((s) => s.name);
  const stats = useStore((s) => s.stats[todayKey]);
  const mailAccount = useStore((s) => s.mail.accounts.length > 0);
  const moveTasks = useStore((s) => s.moveTasks);
  const toast = useToast((s) => s.show);

  const isToday = date === todayKey;
  const nowMin = minutesOfDay(now);
  const plan = useMemo(() => planFor({ tasks, settings, focus, events }, date, now), [tasks, settings, focus, events, date, now]);

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

  // j/k to move, e to toggle done, f to focus.
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
      } else if (e.key === "f" && i >= 0 && isToday && !order[i].done) {
        useStore.getState().startFocus(order[i].id);
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
  const focusMin = Math.round((stats?.focusMinutes ?? 0) + focusElapsedRunning(focus, now));
  const eveningSoon = isToday && nowMin >= settings.dayEnd - 60;

  const subtitle = (() => {
    if (!dayTasks.length) return isToday ? "Tell Kindred what's on your mind and it will plan your day." : "Nothing here yet.";
    const left = dayTasks.length - doneCount;
    if (left === 0) return "Everything's done. Nice work.";
    const parts = [`${left} ${left === 1 ? "thing" : "things"} left`];
    if (isToday && plan.remaining) parts.push(`about ${formatDuration(plan.remaining)} of work`);
    if (plan.overflow.length) parts.push(`${plan.overflow.length} won't fit`);
    return parts.join(" · ");
  })();

  return (
    <div className="page">
      <header className="page-head today-head">
        <div>
          <p className="eyebrow">{formatLongDate(date)}</p>
          <h1 className="title">{isToday ? `${greeting(now)}${name ? `, ${name}` : ""}` : formatDay(date, todayKey)}</h1>
          <p className="subtitle">{subtitle}</p>
        </div>
        <div className="row head-tools">
          <button type="button" className="icon-btn labeled" onClick={() => setFreeTime(true)} title="Copy your free time to paste into a reply">
            <CalendarClock size={16} />
            <span>Free time</span>
          </button>
          {isToday && dayTasks.length > 0 && (
            <button type="button" className="icon-btn labeled" onClick={() => setWrapUp(true)} title="Close out today and plan tomorrow">
              <Moon size={16} />
              <span>Wrap up</span>
            </button>
          )}
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

      {(() => {
        const allDay = eventsOn(events, date).filter((e) => e.allDay);
        if (!allDay.length) return null;
        return (
          <div className="allday-row" aria-label="All-day events">
            {allDay.map((e) => (
              <span key={e.uid} className="allday-chip" style={{ ["--cal" as string]: calendars.find((c) => c.id === e.calendarId)?.color ?? "var(--work)" }}>
                <span className="dot" aria-hidden="true" />
                {e.title}
              </span>
            ))}
          </div>
        );
      })()}

      <DayStrip plan={plan} settings={settings} nowMin={nowMin} isToday={isToday} />

      {isToday && <NowHero plan={plan} nowMin={nowMin} />}

      <Capture ref={captureRef} date={date} today={todayKey} />

      <div className="today-grid">
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

        <aside className="rail" aria-label="Today at a glance">
          <div className="stats">
            <div className="stat">
              <div className="v">
                {doneCount}
                <span className="muted" style={{ fontSize: 14 }}>/{dayTasks.length}</span>
              </div>
              <div className="k">Done</div>
            </div>
            <div className="stat">
              <div className="v">{isToday ? formatShort(focusMin) : "–"}</div>
              <div className="k">Focused</div>
            </div>
            <div className="stat">
              <div className="v">{formatShort(plan.remaining)}</div>
              <div className="k">Left</div>
            </div>
          </div>

          <UpcomingEvents plan={plan} nowMin={isToday ? nowMin : -1} />

          {plan.overflow.length > 0 && (
            <section className="card pad" aria-label="Doesn't fit today">
              <h2 className="section">Doesn't fit {isToday ? "today" : "this day"}</h2>
              <div className="list">
                {plan.overflow.map((t) => (
                  <div className="list-item" key={t.id}>
                    <span className={`dot ${t.category}`} aria-hidden="true" />
                    <span className="truncate list-title" style={{ flex: 1 }}>
                      {t.title}
                    </span>
                    <span className="muted small">{formatDuration(t.duration)}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn sm"
                style={{ marginTop: 12 }}
                onClick={() => {
                  moveTasks(plan.overflow.map((t) => t.id), tomorrowOf(date));
                  toast("Moved to tomorrow");
                }}
              >
                Move to tomorrow <ArrowRight size={14} />
              </button>
            </section>
          )}

          {isToday && <InboxPeek connected={!!mailAccount} goInbox={goInbox} />}

          {eveningSoon && dayTasks.length > 0 && (
            <section className="card pad" aria-label="Evening">
              <h2 className="section">
                <Moon size={14} /> Almost the end of your day
              </h2>
              <p className="muted small" style={{ margin: "0 0 12px" }}>
                Take 30 seconds to close out today and get tomorrow ready.
              </p>
              <button type="button" className="btn primary sm" onClick={() => setWrapUp(true)}>
                Wrap up
              </button>
            </section>
          )}
        </aside>
      </div>

      {openTask && (
        <div className="drawer">
          <TaskDetail taskId={openTask} onClose={() => setOpenTask(null)} />
        </div>
      )}
      {freeTime && <FreeTime todayKey={todayKey} onClose={() => setFreeTime(false)} />}
      {wrapUp && <WrapUp date={date} onClose={() => setWrapUp(false)} onPlanTomorrow={() => setDate(tomorrowOf(todayKey))} />}
    </div>
  );
}

/** The rest of today's calendar, so meetings never sneak up on you. */
function UpcomingEvents({ plan, nowMin }: { plan: ReturnType<typeof planFor>; nowMin: number }) {
  const calendars = useStore((s) => s.calendars);
  const events = plan.blocks.filter((b) => b.kind === "event" && b.end > nowMin);
  if (!events.length) return null;
  return (
    <section className="card pad" aria-label="On your calendar">
      <h2 className="section">
        <CalendarDays size={14} /> On your calendar
      </h2>
      <div className="list">
        {events.map((b) => {
          const color = b.event!.calendarId === "local" ? "var(--brand)" : (calendars.find((c) => c.id === b.event!.calendarId)?.color ?? "var(--work)");
          return (
            <div className="list-item upcoming" key={`${b.event!.uid}-${b.start}`}>
              <span className="upcoming-bar" style={{ background: color }} aria-hidden="true" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="list-title truncate">{b.event!.title}</div>
                <div className="muted small row" style={{ gap: 6 }}>
                  {formatTime(b.start)} – {formatTime(b.end)}
                  {b.event!.location && (
                    <span className="row truncate" style={{ gap: 3 }}>
                      · <MapPin size={11} aria-hidden="true" /> {b.event!.location}
                    </span>
                  )}
                </div>
              </div>
              {b.start <= nowMin && <span className="chip brand">Now</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Minutes of the current, not-yet-saved focus run. */
function focusElapsedRunning(focus: ReturnType<typeof useStore.getState>["focus"], now: Date): number {
  if (!focus?.runningSince) return 0;
  return (focusElapsed({ ...focus, elapsed: 0 }, now.getTime())) / 60000;
}

function formatShort(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

function InboxPeek({ connected, goInbox }: { connected: boolean; goInbox: () => void }) {
  const { needsYou } = useMailItems();
  const addMailTask = useStore((s) => s.addMailTask);
  const toast = useToast((s) => s.show);

  if (!connected) {
    return (
      <section className="card pad" aria-label="Email">
        <h2 className="section">
          <Mail size={14} /> Your inbox, organized
        </h2>
        <p className="muted small" style={{ margin: "0 0 12px" }}>
          Connect your email and Kindred finds deadlines and requests and turns them into tasks. It all happens on this computer.
        </p>
        <button type="button" className="btn sm" onClick={goInbox}>
          Connect email
        </button>
      </section>
    );
  }

  return (
    <section className="card pad" aria-label="From your inbox">
      <h2 className="section">
        <Inbox size={14} /> From your inbox
        {needsYou.length > 0 && <span className="chip brand" style={{ height: 20, marginLeft: "auto" }}>{needsYou.length}</span>}
      </h2>
      {needsYou.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          Nothing needs you right now.
        </p>
      ) : (
        <div className="list">
          {needsYou.slice(0, 3).map(({ message, suggestion }) => (
            <div className="list-item" key={message.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="truncate list-title">{suggestion!.title}</div>
                <div className="muted small truncate">{message.fromName || message.fromAddress}</div>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Add "${suggestion!.title}" to your plan`}
                title="Add to plan"
                onClick={() => {
                  addMailTask(suggestion!);
                  toast("Added to your plan");
                }}
              >
                <Plus size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="btn ghost sm" style={{ marginTop: 8, marginLeft: -10 }} onClick={goInbox}>
        Open inbox <ArrowRight size={14} />
      </button>
    </section>
  );
}

/** Open time over the next few working days, ready to paste into an email. */
function FreeTime({ todayKey, onClose }: { todayKey: string; onClose: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const events = useStore((s) => s.events);
  const settings = useStore((s) => s.settings);
  const toast = useToast((s) => s.show);
  const [days, setDays] = useState(3);
  const tz = Intl.DateTimeFormat(undefined, { timeZoneName: "long" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "local time";

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
  const focusMin = Math.round(useStore((s) => s.stats[date]?.focusMinutes ?? 0));
  const moveTasks = useStore((s) => s.moveTasks);
  const done = tasks.filter((t) => t.done);
  const open = tasks.filter((t) => !t.done);
  const toast = useToast((s) => s.show);

  return (
    <Modal onClose={onClose} labelledBy="wrapup-title">
      <h2 id="wrapup-title">{done.length ? "Nice work today" : "Today's wrap-up"}</h2>
      <p className="muted" style={{ margin: "0 0 18px" }}>
        You finished {done.length} of {tasks.length} {tasks.length === 1 ? "thing" : "things"}
        {focusMin ? ` and focused for ${formatDuration(focusMin)}` : ""}.
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
            if (open.length) moveTasks(open.map((t) => t.id), tomorrowOf(date));
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
