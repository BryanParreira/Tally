import { useEffect, useRef } from "react";
import { BookOpen, CalendarDays, CheckSquare, GraduationCap, Inbox, PanelLeft, Search, Settings as SettingsIcon, ShieldCheck, Sun } from "lucide-react";
import { Logo, Toast } from "./components/ui";
import { CommandMenu, CreateLauncher, ShortcutsHelp } from "./components/CommandMenu";
import { focusElapsed, planFor, rollOverUnfinished, today, useStore } from "./lib/store";
import { useNow, useTheme, useToast } from "./lib/hooks";
import { isDesktop, isMac, mailFetch, onQuickCapture, setNowBarVisible, showNotice } from "./lib/native";
import { syncAllCalendars } from "./lib/calendarSync";
import { isTyping, useNav, type View } from "./lib/nav";
import { blockTitle, currentAndNext } from "./lib/schedule";
import { formatDuration, formatTime, minutesOfDay } from "./lib/date";
import { TodayView } from "./views/TodayView";
import { InboxView, useTriage } from "./views/InboxView";
import { StudyView } from "./views/StudyView";
import { NotesView } from "./views/NotesView";
import { TasksView } from "./views/TasksView";
import { CalendarView } from "./views/CalendarView";
import { SettingsView } from "./views/SettingsView";
import { Onboarding } from "./views/Onboarding";

const MAIL_SYNC_EVERY = 10 * 60_000;
const CALENDAR_SYNC_EVERY = 30 * 60_000;

export function App() {
  const view = useNav((s) => s.view);
  const palette = useNav((s) => s.palette);
  const help = useNav((s) => s.help);
  const launcher = useNav((s) => s.launcher);
  const collapsed = useNav((s) => s.collapsed);
  const onboarded = useStore((s) => s.onboarded);
  const theme = useStore((s) => s.settings.theme);
  const nowBar = useStore((s) => s.settings.nowBar);
  const now = useNow(30_000);
  const todayKey = today();
  useTheme(theme);

  // A new day: carry unfinished work forward automatically.
  const lastDay = useRef(todayKey);
  useEffect(() => {
    if (lastDay.current !== todayKey) {
      lastDay.current = todayKey;
      rollOverUnfinished();
    }
  }, [todayKey, now]);

  useEffect(() => {
    if (onboarded) setNowBarVisible(nowBar).catch(() => undefined);
  }, [onboarded, nowBar]);

  useEffect(() => {
    let off: (() => void) | undefined;
    onQuickCapture(() => useNav.getState().capture()).then((fn) => (off = fn));
    return () => off?.();
  }, []);

  useShortcuts(onboarded);
  useReminders(onboarded);
  useMailAutoSync();
  useCalendarAutoSync();

  if (!onboarded) return <Onboarding />;

  return (
    <div className={`app${isMac ? " platform-mac" : ""}${collapsed ? " sidebar-collapsed" : ""}`}>
      {isMac && isDesktop && <div className="drag" data-tauri-drag-region />}
      <Sidebar view={view} />
      <main className="main">
        {view === "today" && <TodayView todayKey={todayKey} />}
        {view === "inbox" && <InboxView />}
        {view === "tasks" && <TasksView />}
        {view === "calendar" && <CalendarView />}
        {view === "study" && <StudyView />}
        {view === "notes" && <NotesView />}
        {view === "settings" && <SettingsView />}
      </main>
      {palette && <CommandMenu />}
      {launcher && <CreateLauncher />}
      {help && <ShortcutsHelp onClose={() => useNav.getState().setHelp(false)} />}
      <Toast />
    </div>
  );
}

function Sidebar({ view }: { view: View }) {
  const { signal } = useTriage();
  const go = useNav((s) => s.go);
  const setPalette = useNav((s) => s.setPalette);
  const toggleSidebar = useNav((s) => s.toggleSidebar);
  const collapsed = useNav((s) => s.collapsed);
  const items: { id: View; label: string; icon: typeof Sun; key: string; count?: number }[] = [
    { id: "today", label: "Today", icon: Sun, key: "H" },
    { id: "inbox", label: "Inbox", icon: Inbox, key: "I", count: signal.length },
    { id: "tasks", label: "Tasks", icon: CheckSquare, key: "T" },
    { id: "calendar", label: "Calendar", icon: CalendarDays, key: "R" },
    { id: "notes", label: "Notes", icon: BookOpen, key: "N" },
    { id: "study", label: "Study", icon: GraduationCap, key: "S" },
  ];
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand-row" data-tauri-drag-region>
        <Logo />
        <span className="wordmark">Kindred</span>
        <button type="button" className="icon-btn collapse-btn" aria-label="Collapse sidebar" title={`Collapse sidebar (${isMac ? "⌘" : "Ctrl"} .)`} onClick={toggleSidebar}>
          <PanelLeft size={15} />
        </button>
      </div>
      <button type="button" className="search-btn" onClick={() => setPalette(true)}>
        <Search size={15} aria-hidden="true" />
        <span className="label-text">Search</span>
        <span className="kbd label-text">{isMac ? "⌘K" : "Ctrl K"}</span>
      </button>
      {items.map((it) => (
        <button key={it.id} type="button" className="nav-item" aria-current={view === it.id ? "page" : undefined} onClick={() => go(it.id)} title={`${it.label} (G then ${it.key})`}>
          <it.icon size={17} strokeWidth={1.8} aria-hidden="true" />
          <span className="label-text">{it.label}</span>
          {!!it.count && (
            <span className="count" aria-label={`${it.count} need you`}>
              {it.count}
            </span>
          )}
        </button>
      ))}
      <div className="sidebar-foot">
        <button type="button" className="nav-item" aria-current={view === "settings" ? "page" : undefined} onClick={() => go("settings")} title="Settings (G then ,)">
          <SettingsIcon size={17} strokeWidth={1.8} aria-hidden="true" />
          <span className="label-text">Settings</span>
        </button>
        {collapsed && (
          <button type="button" className="nav-item" aria-label="Expand sidebar" title={`Expand sidebar (${isMac ? "⌘" : "Ctrl"} .)`} onClick={toggleSidebar}>
            <PanelLeft size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
        <div className="privacy">
          <ShieldCheck size={15} aria-hidden="true" />
          <div>
            <strong>Private by design</strong>
            Everything stays on this computer.
          </div>
        </div>
      </div>
    </nav>
  );
}

const GO_KEYS: Record<string, View> = { h: "today", i: "inbox", t: "tasks", r: "calendar", n: "notes", s: "study", ",": "settings" };

/** Macro-style keyboard control: ⌘K, /, c, g-then-key and ?. */
function useShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      const nav = useNav.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        nav.setPalette(!nav.palette);
        return;
      }
      if (mod && e.key === ".") {
        e.preventDefault();
        nav.toggleSidebar();
        return;
      }
      if (mod && e.key === ";") {
        e.preventDefault();
        nav.go("settings");
        return;
      }
      if (nav.palette || nav.help || nav.launcher || isTyping(e) || mod || e.altKey) return;
      if (document.querySelector(".modal")) return;

      if (Date.now() - pendingG < 1200 && GO_KEYS[e.key.toLowerCase()]) {
        e.preventDefault();
        pendingG = 0;
        nav.go(GO_KEYS[e.key.toLowerCase()]);
        return;
      }
      pendingG = 0;
      if (e.key === "g") pendingG = Date.now();
      else if (e.key === "/") {
        e.preventDefault();
        nav.setPalette(true);
      } else if (e.key === "c") {
        e.preventDefault();
        nav.setLauncher(true);
      } else if (e.key === "?") {
        nav.setHelp(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/**
 * Gentle reminders as Kindred notification cards: when a new task begins and
 * when a focus session reaches its planned length. Each fires once.
 */
function useReminders(enabled: boolean) {
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const focus = useStore((s) => s.focus);
  const events = useStore((s) => s.events);
  const toast = useToast((s) => s.show);
  const now = useNow(focus?.runningSince ? 5000 : 20_000);
  const lastCurrent = useRef<string | null | undefined>(undefined);
  const focusNotified = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !settings.reminders) return;
    const d = today();
    const nowMin = minutesOfDay(now);
    const { current, next } = currentAndNext(planFor({ tasks, settings, focus, events }, d, now), nowMin);
    const currentId = current?.kind === "task" ? (current.task?.id ?? null) : null;

    // The first pass only records where the day is, so opening the app is quiet.
    if (lastCurrent.current === undefined) {
      lastCurrent.current = currentId;
    } else if (currentId && currentId !== lastCurrent.current && currentId !== focus?.taskId) {
      lastCurrent.current = currentId;
      const t = current!.task!;
      const body = `Until ${formatTime(current!.end)} · ${formatDuration(t.duration)}${next ? `. Then ${blockTitle(next)}.` : "."}`;
      showNotice({ id: `${t.id}:${Date.now()}`, kind: "up-next", title: t.title, body, taskId: t.id })
        .then((shown) => !shown && toast(`Up now: ${t.title}`))
        .catch(() => undefined);
    } else if (!currentId) {
      lastCurrent.current = null;
    }

    if (focus?.runningSince) {
      const t = tasks.find((x) => x.id === focus.taskId);
      if (t && focusNotified.current !== `${t.id}:${t.duration}` && focusElapsed(focus, now.getTime()) >= t.duration * 60000) {
        focusNotified.current = `${t.id}:${t.duration}`;
        const body = `You focused for ${formatDuration(Math.round(focusElapsed(focus, now.getTime()) / 60000))}. Mark it done, or give it a few more minutes.`;
        showNotice({ id: `${t.id}:done:${Date.now()}`, kind: "focus-done", title: t.title, body, taskId: t.id })
          .then((shown) => !shown && toast(`Time's up: ${t.title}`))
          .catch(() => undefined);
      }
    }
  }, [enabled, tasks, settings, focus, events, now, toast]);
}

/** Refresh subscribed calendars on start and every half hour. */
function useCalendarAutoSync() {
  const count = useStore((s) => s.calendars.length);
  useEffect(() => {
    if (!count || !isDesktop) return;
    const run = () => {
      const stale = useStore.getState().calendars.some((c) => !c.lastSync || Date.now() - c.lastSync > CALENDAR_SYNC_EVERY - 5000);
      if (stale) syncAllCalendars();
    };
    run();
    const id = setInterval(run, CALENDAR_SYNC_EVERY);
    return () => clearInterval(id);
  }, [count]);
}

/** Keep the inbox fresh in the background while the app is open. */
function useMailAutoSync() {
  const account = useStore((s) => s.mail.account);
  const setMessages = useStore((s) => s.setMessages);
  useEffect(() => {
    if (!account || !isDesktop) return;
    let stopped = false;
    const run = async () => {
      const last = useStore.getState().mail.lastSync ?? 0;
      if (Date.now() - last < MAIL_SYNC_EVERY - 5000) return;
      try {
        const messages = await mailFetch(account);
        if (!stopped) setMessages(messages);
      } catch {
        /* offline or signed out: try again next round */
      }
    };
    run();
    const id = setInterval(run, MAIL_SYNC_EVERY);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [account, setMessages]);
}
