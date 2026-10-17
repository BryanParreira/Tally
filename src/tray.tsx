import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { ArrowUpRight, Check, ChevronRight, Plus, Power, Search, Settings, Sun } from "lucide-react";
import { Avatar } from "./components/ui";
import { TrayCalendar } from "./components/TrayCalendar";
import { formatLongDate, formatTime, minutesOfDay } from "./lib/date";
import { useNow, useTheme } from "./lib/hooks";
import { hideTray, markFloatingWindow, openView, quitApp } from "./lib/native";
import { parseBrainDump } from "./lib/parse";
import { blockTitle, currentAndNext, type PlannedBlock } from "./lib/schedule";
import { spring } from "./lib/motion";
import { initStore, planFor, today, useStore } from "./lib/store";
import { noteExcerpt, noteTitle } from "./lib/notes";
import { inboxName } from "./lib/mailSync";
import { buildTriage, type TriageItem } from "./lib/triage";
import "./styles/app.css";

type TrayTab = "today" | "inbox" | "calendar" | "notes";
const TABS: TrayTab[] = ["today", "inbox", "calendar", "notes"];

/** The panel that drops down from the menu bar / taskbar icon. */
function TrayPanel() {
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const events = useStore((s) => s.events);
  const mail = useStore((s) => s.mail);
  const notes = useStore((s) => s.notes);
  const triageDone = useStore((s) => s.triageDone);
  const name = useStore((s) => s.name);
  const { toggleDone, planDump } = useStore.getState();
  const now = useNow(20_000);
  const [text, setText] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const [tab, setTab] = useState<TrayTab>("today");
  useTheme(settings.theme);
  const d = today();

  // Keyboard: 1–4 (or ⌘1–4, or ←/→) switch views, ↑/↓ move through a list, Enter opens, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return hideTray();
      const typing = e.target instanceof HTMLInputElement && e.target.value !== "";
      const n = Number(e.key);
      if (n >= 1 && n <= TABS.length && (e.metaKey || e.ctrlKey || !(e.target instanceof HTMLInputElement))) {
        e.preventDefault();
        setTab(TABS[n - 1]);
      } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !typing) {
        e.preventDefault();
        setTab((t) => TABS[(TABS.indexOf(t) + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const rows = [...document.querySelectorAll<HTMLElement>("button.tray-row, .tray-mail .tray-row-text")];
        if (!rows.length) return;
        e.preventDefault();
        const i = rows.indexOf(document.activeElement as HTMLElement);
        rows[e.key === "ArrowDown" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1)].focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const plan = useMemo(() => planFor({ tasks, settings, events }, d, now), [tasks, settings, events, d, now]);
  const nowMin = minutesOfDay(now);
  const { current } = currentAndNext(plan, nowMin);
  const upcoming = plan.blocks.filter((b) => b.kind !== "break" && b.start > nowMin && !b.task?.done).slice(0, 4);
  const triage = useMemo(() => buildTriage({ mail, tasks, notes, triageDone }, d).signal, [mail, tasks, notes, triageDone, d]);
  const signal = triage.length;
  const openToday = tasks.filter((t) => t.date === d && !t.done && !t.someday).length;
  const doneToday = tasks.filter((t) => t.date === d && t.done).length;

  const calendars = useStore((s) => s.calendars);
  const total = doneToday + openToday;
  const colorOf = (b: PlannedBlock) =>
    b.kind === "task" ? `var(--${b.task!.category})` : b.event!.calendarId === "local" ? "var(--warn)" : (calendars.find((c) => c.id === b.event!.calendarId)?.color ?? "var(--work)");
  const task = current?.kind === "task" ? current.task : undefined;
  const upNext = upcoming.slice(0, 4);
  const recentNotes = [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  const broken = mail.accounts.filter((a) => a.error);

  const add = () => {
    if (!text.trim()) return;
    const n = planDump(text, d);
    setText("");
    setAdded(n === 1 ? "Added to today" : `Added ${n} things to today`);
    setTimeout(() => setAdded(null), 2200);
  };

  // Decide on an inbox item right from the tray.
  const triageToday = (item: TriageItem) => {
    const s = useStore.getState();
    if (item.kind === "email" && item.message) s.planMail(item.message, d);
    else if (item.kind === "note" && item.noteId) s.planNoteTasks(item.noteId);
    else s.markTriaged(item.id);
  };
  const triageDoneItem = (item: TriageItem) => {
    const s = useStore.getState();
    if (item.kind === "email" && item.message) s.handleMail(item.message.id);
    else s.markTriaged(item.id);
  };

  const tabs: { id: TrayTab; label: string; count?: number }[] = [
    { id: "today", label: "Today" },
    { id: "inbox", label: "Inbox", count: signal },
    { id: "calendar", label: "Calendar" },
    { id: "notes", label: "Notes" },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className="tray">
        <div className="tray-top">
          <div className={`tray-capture${added ? " is-added" : ""}`}>
            {added ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
            <label htmlFor="tray-add" className="sr-only">
              Add to today
            </label>
            <input
              id="tray-add"
              autoFocus
              placeholder={added ?? "Add to today…  “call mom at 6pm”"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            {text && parseBrainDump(text, d).length > 0 ? (
              <button type="button" className="tray-add-btn" onClick={add}>
                Add
              </button>
            ) : (
              <span className="kbd">↵</span>
            )}
          </div>
          <nav className="tray-tabs" aria-label="Views">
            {tabs.map((t, i) => (
              <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)} title={`${t.label} (${i + 1})`}>
                {tab === t.id && <motion.span layoutId="tray-tab" className="seg-thumb" transition={spring} />}
                <span className="seg-label">
                  {t.label}
                  {!!t.count && <span className="seg-count">{t.count}</span>}
                </span>
              </button>
            ))}
          </nav>
        </div>

        <div className="tray-body">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={tab} className="tray-view" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }}>
              {tab === "today" && (
                <>
                  {current ? (
                    <section className="tray-now" style={{ ["--c" as string]: current.kind === "break" ? "var(--ink-3)" : colorOf(current) }} aria-label="Right now">
                      <div className="tray-now-text">
                        <div className="tray-now-label">
                          <span className="pulse" /> {current.kind === "event" ? "On now" : current.kind === "break" ? "Break" : "Now"}
                        </div>
                        <div className="tray-now-title">{current.kind === "break" ? "Stretch and rest your eyes" : blockTitle(current)}</div>
                        <div className="tray-now-sub">
                          {formatTime(current.start)} – {formatTime(current.end)}
                        </div>
                      </div>
                      {task && (
                        <button type="button" className="tray-done" onClick={() => toggleDone(task.id, current.start)}>
                          <Check size={14} strokeWidth={2.6} /> Done
                        </button>
                      )}
                    </section>
                  ) : (
                    <section className="tray-now is-free" aria-label="Right now">
                      <div className="tray-now-text">
                        <div className="tray-now-label">Free</div>
                        <div className="tray-now-title">{upNext[0] ? `Free until ${formatTime(upNext[0].start)}` : "Nothing else today"}</div>
                        <div className="tray-now-sub">{upNext[0] ? `Then ${blockTitle(upNext[0])}` : name ? `Enjoy the quiet, ${name}` : "Enjoy the quiet"}</div>
                      </div>
                    </section>
                  )}

                  {upNext.length > 0 && (
                    <section className="tray-group" aria-label="Up next">
                      <h2 className="tray-section">Up next</h2>
                      {upNext.map((b, i) => (
                        <button key={i} type="button" className="tray-row" onClick={() => openView(b.kind === "event" ? "calendar" : "today")}>
                          <Marker kind={b.kind === "task" ? "task" : "event"} color={colorOf(b)} />
                          <span className="tray-row-title truncate">{blockTitle(b)}</span>
                          <span className="tray-row-time">{formatTime(b.start)}</span>
                        </button>
                      ))}
                    </section>
                  )}

                  {signal > 0 && (
                    <button type="button" className="tray-inbox-peek" onClick={() => setTab("inbox")}>
                      <span className="tray-avatars" aria-hidden="true">
                        {triage.slice(0, 3).map((t) => (
                          <Avatar key={t.id} name={t.from} size={22} />
                        ))}
                      </span>
                      <span>
                        {signal} {signal === 1 ? "thing needs" : "things need"} you
                      </span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  )}
                </>
              )}

              {tab === "inbox" && (
                <div className="tray-list">
                  {broken.length > 0 && (
                    <button type="button" className="tray-warn" onClick={() => openView("inbox")}>
                      {broken.length === 1 ? `${inboxName(broken[0])} needs reconnecting` : "Some inboxes need reconnecting"}
                    </button>
                  )}
                  {triage.length === 0 && <p className="tray-empty">You're all caught up.</p>}
                  <AnimatePresence initial={false} mode="popLayout">
                    {triage.slice(0, 6).map((item) => (
                      <motion.div key={item.id} layout="position" exit={{ opacity: 0, x: 16, transition: { duration: 0.14 } }} transition={spring} className="tray-row tray-mail">
                        <Avatar name={item.from} size={28} />
                        <button type="button" className="tray-row-text" onClick={() => openView("inbox")}>
                          <span className="tray-row-title truncate">{item.from}</span>
                          <span className="tray-row-sub truncate">{item.title}</span>
                        </button>
                        <span className="tray-row-actions">
                          <button type="button" className="icon-btn" title="Add to today" aria-label="Add to today" onClick={() => triageToday(item)}>
                            <Sun size={14} />
                          </button>
                          <button type="button" className="icon-btn" title="Done" aria-label="Done" onClick={() => triageDoneItem(item)}>
                            <Check size={14} />
                          </button>
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {tab === "calendar" && <TrayCalendar today={d} />}

              {tab === "notes" && (
                <div className="tray-list">
                  {recentNotes.length === 0 && <p className="tray-empty">No notes yet.</p>}
                  {recentNotes.map((n) => (
                    <button key={n.id} type="button" className="tray-row" onClick={() => openView("notes")}>
                      <span className="tray-row-text">
                        <span className="tray-row-title truncate">{noteTitle(n.title, n.body)}</span>
                        <span className="tray-row-sub truncate">{noteExcerpt(n.body, 60) || "Empty page"}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="tray-foot">
          <span className="tray-foot-text truncate">
            {formatLongDate(d)}
            {total ? ` · ${doneToday}/${total} done` : ""}
          </span>
          <span className="spacer" />
          <button type="button" className="icon-btn" aria-label="Search everything" title="Search" onClick={() => openView("search")}>
            <Search size={15} />
          </button>
          <button type="button" className="icon-btn" aria-label="Open Kindred" title="Open Kindred" onClick={() => openView(tab)}>
            <ArrowUpRight size={15} />
          </button>
          <button type="button" className="icon-btn" aria-label="Settings" title="Settings" onClick={() => openView("settings")}>
            <Settings size={15} />
          </button>
          <button type="button" className="icon-btn" aria-label="Quit Kindred" title="Quit Kindred" onClick={() => quitApp()}>
            <Power size={15} />
          </button>
        </footer>
      </div>
    </MotionConfig>
  );
}

/** A plain marker before a row: an open circle for a task, a small dot in the calendar's colour for an event. */
function Marker({ kind, color }: { kind: "task" | "event"; color: string }) {
  return kind === "task" ? <span className="mark-task" aria-hidden="true" /> : <span className="mark-event" style={{ background: color }} aria-hidden="true" />;
}

markFloatingWindow();
initStore().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <TrayPanel />
    </StrictMode>,
  );
});
