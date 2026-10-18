import { Fragment, useEffect, useRef } from "react";
import { MotionConfig, motion } from "motion/react";
import { fade, spring } from "./lib/motion";
import { BookOpen, CalendarDays, CheckSquare, FolderKanban, Inbox, Moon, PanelLeft, Settings as SettingsIcon, ShieldCheck, Sun } from "lucide-react";
import { Logo, Toast } from "./components/ui";
import { Chat } from "./components/Chat";
import { TasksNav } from "./components/TasksNav";
import { FavoritesNav } from "./components/Favorite";
import { ContactModal } from "./components/ContactModal";
import { installAssistant, refreshAi, useAi } from "./lib/ai";
import { CommandMenu, CreateLauncher, ShortcutsHelp } from "./components/CommandMenu";
import { planFor, rollOverUnfinished, today, useStore } from "./lib/store";
import { isDarkTheme, useNow, useTheme, useToast } from "./lib/hooks";
import { isDesktop, isMac, onNavigate, onQuickCapture, setNativeTheme, showNotice, type Notice } from "./lib/native";
import { syncAllInboxes } from "./lib/mailSync";
import { checkForUpdate, installUpdate, useUpdate } from "./lib/updater";
import { syncAllCalendars } from "./lib/calendarSync";
import { isTyping, useNav, type View } from "./lib/nav";
import { eveningCard, morningCard } from "./lib/ritual";
import { blockTitle, currentAndNext } from "./lib/schedule";
import { formatTime, minutesOfDay } from "./lib/date";
import { TodayView } from "./views/TodayView";
import { TasksView } from "./views/TasksView";
import { ProjectsView } from "./views/ProjectsView";
import { InboxView, useTriage } from "./views/InboxView";
import { NotesView } from "./views/NotesView";
import { CalendarView } from "./views/calendar/CalendarView";
import { SettingsView } from "./views/SettingsView";
import { Onboarding } from "./views/Onboarding";

const MAIL_SYNC_EVERY = 10 * 60_000;
const CALENDAR_SYNC_EVERY = 30 * 60_000;

export function App() {
  const view = useNav((s) => s.view);
  const palette = useNav((s) => s.palette);
  const contact = useNav((s) => s.contact);
  const help = useNav((s) => s.help);
  const launcher = useNav((s) => s.launcher);
  const chat = useNav((s) => s.chat);
  const collapsed = useNav((s) => s.collapsed);
  const onboarded = useStore((s) => s.onboarded);
  const assistantOn = useStore((s) => s.settings.assistant);
  const theme = useStore((s) => s.settings.theme);
  const now = useNow(30_000);
  const todayKey = today();
  useTheme(theme, (dark) => setNativeTheme(theme, dark).catch(() => undefined));

  // A new day: carry unfinished work forward automatically.
  const lastDay = useRef(todayKey);
  useEffect(() => {
    if (lastDay.current !== todayKey) {
      lastDay.current = todayKey;
      rollOverUnfinished();
    }
  }, [todayKey, now]);

  useEffect(() => {
    let off: (() => void) | undefined;
    onQuickCapture(() => useNav.getState().capture()).then((fn) => (off = fn));
    return () => off?.();
  }, []);

  // The tray panel opens pages here.
  useEffect(() => {
    let off: (() => void) | undefined;
    onNavigate((view) => {
      const nav = useNav.getState();
      if (view === "search") nav.setPalette(true);
      else if (view === "capture") nav.capture();
      else if (view === "wrapup") nav.wrapUp();
      else if (["today", "tasks", "projects", "inbox", "calendar", "notes", "settings"].includes(view)) nav.go(view as View);
    }).then((fn) => (off = fn));
    return () => off?.();
  }, []);

  useShortcuts(onboarded);
  useReminders(onboarded);
  useDailyRitual(onboarded);
  useMailAutoSync();
  useCalendarAutoSync();
  useAutoUpdate();
  useAssistantSetup(true);

  if (!onboarded) return <Onboarding />;

  return (
    <MotionConfig reducedMotion="user">
      <div className={`app${isMac ? " platform-mac" : ""}${collapsed ? " sidebar-collapsed" : ""}`}>
        {isMac && isDesktop && <div className="drag" data-tauri-drag-region />}
        <Sidebar view={view} />
        <div className={`stage${view === "today" && assistantOn ? " has-dock" : ""}`}>
        <main className="main">
          {/* Each page eases in when you switch to it. */}
          <motion.div key={view} className="view" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={fade}>
            {view === "today" && <TodayView todayKey={todayKey} />}
            {view === "tasks" && <TasksView />}
            {view === "projects" && <ProjectsView />}
            {view === "inbox" && <InboxView />}
            {view === "calendar" && <CalendarView />}
            {view === "notes" && <NotesView />}
            {view === "settings" && <SettingsView />}
          </motion.div>
        </main>
        <Chat open={chat} view={view} />
        </div>
        {palette && <CommandMenu />}
        {contact && <ContactModal address={contact} />}
        {launcher && <CreateLauncher />}
        {help && <ShortcutsHelp onClose={() => useNav.getState().setHelp(false)} />}
        <Toast />
      </div>
    </MotionConfig>
  );
}

function Sidebar({ view }: { view: View }) {
  const { signal } = useTriage();
  const go = useNav((s) => s.go);
  const toggleSidebar = useNav((s) => s.toggleSidebar);
  const collapsed = useNav((s) => s.collapsed);
  // The loop: plan the day, clear the inbox, keep every task, see the week, write things down.
  const items: { id: View; label: string; icon: typeof Sun; key: string; count?: number }[] = [
    { id: "today", label: "Today", icon: Sun, key: "H" },
    { id: "tasks", label: "Tasks", icon: CheckSquare, key: "T" },
    { id: "projects", label: "Projects", icon: FolderKanban, key: "P" },
    { id: "inbox", label: "Inbox", icon: Inbox, key: "I", count: signal.length },
    { id: "calendar", label: "Calendar", icon: CalendarDays, key: "R" },
    { id: "notes", label: "Notes", icon: BookOpen, key: "N" },
  ];
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand-row" data-tauri-drag-region>
        <Logo />
        <span className="wordmark">Tally</span>
        <button type="button" className="icon-btn collapse-btn" aria-label="Collapse sidebar" title={`Collapse sidebar (${isMac ? "⌘" : "Ctrl"} .)`} onClick={toggleSidebar}>
          <PanelLeft size={15} />
        </button>
      </div>
      {items.map((it) => (
        <Fragment key={it.id}>
        <button
          type="button"
          className="nav-item"
          aria-current={view === it.id ? "page" : undefined}
          onClick={() => go(it.id)}
          title={`${it.label} (G then ${it.key})`}
        >
          {view === it.id && <motion.span layoutId="nav-active" className="nav-active" transition={spring} />}
          <it.icon size={17} strokeWidth={1.8} aria-hidden="true" />
          <span className="label-text">{it.label}</span>
          {!!it.count && (
            <span className="count" aria-label={`${it.count} need you`}>
              {it.count}
            </span>
          )}
        </button>
        {it.id === "tasks" && view === "tasks" && !collapsed && <TasksNav />}
        </Fragment>
      ))}
      {!collapsed && <FavoritesNav />}
      <div className="sidebar-foot">
        <div className="settings-row">
          <button type="button" className="nav-item" aria-current={view === "settings" ? "page" : undefined} onClick={() => go("settings")} title="Settings (G then ,)">
            {view === "settings" && <motion.span layoutId="nav-active" className="nav-active" transition={spring} />}
            <SettingsIcon size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className="label-text">Settings</span>
          </button>
          <ThemeButton />
        </div>
        {collapsed && (
          <button type="button" className="nav-item expand-btn" aria-label="Expand sidebar" title={`Expand sidebar (${isMac ? "⌘" : "Ctrl"} .)`} onClick={toggleSidebar}>
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

/** One click between day and night. "System" stays available in Settings. */
function ThemeButton() {
  const theme = useStore((s) => s.settings.theme);
  const dark = isDarkTheme(theme);
  return (
    <button
      type="button"
      className="icon-btn theme-btn"
      aria-label={dark ? "Switch to light" : "Switch to dark"}
      title={dark ? "Switch to light" : "Switch to dark"}
      onClick={() => useStore.getState().updateSettings({ theme: dark ? "light" : "dark" })}
    >
      {dark ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
    </button>
  );
}

const GO_KEYS: Record<string, View> = { h: "today", t: "tasks", p: "projects", i: "inbox", r: "calendar", n: "notes", ",": "settings" };

/** Macro-style keyboard control: ⌘K, /, c, g-then-key and ?. */
function useShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      const nav = useNav.getState();
      const mod = e.metaKey || e.ctrlKey;
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
 * Gentle reminders as Tally notification cards: one when a task or a
 * calendar event begins. Each fires once, and opening the app is quiet.
 */
function useReminders(enabled: boolean) {
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const events = useStore((s) => s.events);
  const toast = useToast((s) => s.show);
  const now = useNow(20_000);
  const lastCurrent = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!enabled || !settings.reminders) return;
    const d = today();
    const nowMin = minutesOfDay(now);
    const { current, next } = currentAndNext(planFor({ tasks, settings, events }, d, now), nowMin);
    const key = current?.kind === "task" ? `t:${current.task?.id}` : current?.kind === "event" ? `e:${current.event?.uid}:${current.start}` : null;

    // The first pass only records where the day is. After that, only something that
    // has just begun (in the last couple of minutes) is announced; editing your day
    // so a different task lands on "now" stays quiet.
    const justStarted = !!current && nowMin - current.start >= 0 && nowMin - current.start <= 2;
    if (lastCurrent.current === undefined || !key || key === lastCurrent.current || !justStarted) {
      lastCurrent.current = key;
      return;
    }
    lastCurrent.current = key;
    const title = blockTitle(current!);
    const body = `${current!.kind === "event" ? "On your calendar until" : "Until"} ${formatTime(current!.end)}${next ? `. Then ${blockTitle(next)}.` : "."}`;
    const notice: Notice =
      current!.kind === "task"
        ? { id: `${key}:${Date.now()}`, kind: "task", title, body, taskId: current!.task!.id }
        : { id: `${key}:${Date.now()}`, kind: "event", title, body, taskId: "" };
    showNotice(notice)
      // Without the desktop card, fall back to a toast, but never over an Undo.
      .then((shown) => !shown && !useToast.getState().action && toast(`Up now: ${title}`))
      .catch(() => undefined);
  }, [enabled, tasks, settings, events, now, toast]);
}

/**
 * A calm start and finish: a morning card the first time you are up and about each day,
 * and an evening nudge to wrap up an hour before the day ends. Each shows once a day.
 */
function useDailyRitual(enabled: boolean) {
  const now = useNow(60_000);
  const toast = useToast((s) => s.show);
  useEffect(() => {
    if (!enabled) return;
    const s = useStore.getState();
    if (!s.settings.reminders) return;
    const d = today();
    const nowMin = minutesOfDay(now);
    const once = (kind: "morning" | "evening") => {
      const key = `tally:ritual:${kind}:${d}`;
      try {
        if (localStorage.getItem(key)) return false;
        localStorage.setItem(key, "1");
      } catch {
        return false;
      }
      return true;
    };
    const show = (kind: "morning" | "evening", card: { title: string; body: string } | null) => {
      if (!card) return;
      const notice: Notice = { id: `${kind}:${d}`, kind, title: card.title, body: card.body, taskId: "" };
      showNotice(notice)
        .then((shown) => !shown && !useToast.getState().action && toast(`${card.title}. ${card.body}`))
        .catch(() => undefined);
    };
    // Morning: any time from the start of your day until midday, once.
    if (nowMin >= s.settings.dayStart && nowMin < 12 * 60 && once("morning")) show("morning", morningCard(planFor(s, d, now), s.tasks, d, s.name));
    // Evening: from an hour before the day ends, once.
    else if (nowMin >= s.settings.dayEnd - 60 && nowMin < s.settings.dayEnd + 120 && once("evening")) show("evening", eveningCard(s.tasks, d));
  }, [enabled, now, toast]);
}

/**
 * Updates, as chosen in Settings. "Install automatically" updates shortly after
 * launch (before you start working); later checks only offer it. "Ask" always
 * offers; "Off" never looks.
 */
function useAutoUpdate() {
  const status = useUpdate((s) => s.status);
  const version = useUpdate((s) => s.version);
  const mode = useStore((s) => s.settings.autoUpdate);
  const toast = useToast((s) => s.show);
  const offered = useRef<string | null>(null);
  const launchCheck = useRef(true);
  useEffect(() => {
    if (!isDesktop || mode === "off") return;
    const first = setTimeout(() => {
      checkForUpdate(true).then(() => {
        if (mode === "install" && useUpdate.getState().status === "available") installUpdate();
        launchCheck.current = false;
      });
    }, 8000);
    const id = setInterval(() => checkForUpdate(true), 6 * 60 * 60_000);
    return () => (clearTimeout(first), clearInterval(id));
  }, [mode]);
  useEffect(() => {
    if (status === "available" && version && offered.current !== version && !(mode === "install" && launchCheck.current)) {
      offered.current = version;
      toast(`Tally ${version} is ready`, { label: "Update", run: () => installUpdate() });
    }
  }, [status, version, mode, toast]);
}

/** The assistant's model comes with Tally: the first time the app opens it fetches it quietly in the background, so it is ready by the time you want it. */
function useAssistantSetup(enabled: boolean) {
  const on = useStore((s) => s.settings.assistant);
  const phase = useAi((s) => s.phase);
  const toast = useToast((s) => s.show);
  const announced = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    refreshAi().then(() => {
      if (on && isDesktop && useAi.getState().phase !== "ready") setTimeout(() => installAssistant(), 1500);
    });
  }, [enabled, on]);
  useEffect(() => {
    if (phase === "ready" && announced.current === false && useAi.getState().progress === 1) {
      announced.current = true;
      toast("Tally's assistant is ready", { label: "Try it", run: () => useNav.getState().setChat(true) });
    }
  }, [phase, toast]);
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

/** Keep the inbox fresh in the background while the app is open. Problems show on the inbox itself. */
function useMailAutoSync() {
  const accountIds = useStore((s) => s.mail.accounts.map((a) => a.id).join(","));
  useEffect(() => {
    if (!accountIds || !isDesktop) return;
    const run = () => {
      const last = useStore.getState().mail.lastSync ?? 0;
      if (Date.now() - last >= MAIL_SYNC_EVERY - 5000) syncAllInboxes().catch(() => undefined);
    };
    run();
    const id = setInterval(run, MAIL_SYNC_EVERY);
    return () => clearInterval(id);
  }, [accountIds]);
}
