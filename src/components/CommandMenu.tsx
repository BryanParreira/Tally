import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  Inbox,
  Keyboard,
  Mail,
  Moon,
  NotebookPen,
  PanelBottom,
  Play,
  Search,
  Settings,
  Sparkles,
  Sun,
} from "lucide-react";
import { formatDay, formatTime } from "../lib/date";
import { useMailItems } from "../lib/mailSuggestions";
import { useNav } from "../lib/nav";
import { noteTitle } from "../lib/notes";
import { setNowBarVisible } from "../lib/native";
import { planFor, today, useStore } from "../lib/store";
import { currentAndNext } from "../lib/schedule";
import { minutesOfDay } from "../lib/date";
import { useToast } from "../lib/hooks";

interface Item {
  id: string;
  group: "Actions" | "Go to" | "Tasks" | "Email" | "Notes" | "Courses";
  label: string;
  hint?: string;
  icon: typeof Search;
  keywords?: string;
  run(): void;
}

/** Every query word has to appear; earlier, tighter matches rank higher. */
function score(item: Item, q: string): number {
  if (!q) return 1;
  const hay = `${item.label} ${item.keywords ?? ""} ${item.group}`.toLowerCase();
  let total = 0;
  for (const word of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    const at = hay.indexOf(word);
    if (at < 0) return 0;
    total += at === 0 ? 3 : hay[at - 1] === " " ? 2 : 1;
  }
  return total + (item.label.toLowerCase().startsWith(q.toLowerCase()) ? 5 : 0);
}

export function CommandMenu() {
  const { go, capture, setPalette, setHelp } = useNav.getState();
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const courses = useStore((s) => s.courses);
  const settings = useStore((s) => s.settings);
  const focus = useStore((s) => s.focus);
  const { needsYou, rest } = useMailItems();
  const toast = useToast((s) => s.show);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const d = today();

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const now = new Date();
    const { current } = currentAndNext(planFor({ tasks, settings, focus }, d, now), minutesOfDay(now));

    out.push({ id: "a:capture", group: "Actions", label: "Plan something new", hint: "C", icon: Sparkles, keywords: "add task brain dump capture", run: capture });
    if (current?.task && !focus)
      out.push({ id: "a:focus", group: "Actions", label: `Start focus: ${current.task.title}`, icon: Play, keywords: "focus timer", run: () => useStore.getState().startFocus(current.task!.id) });
    out.push({
      id: "a:note",
      group: "Actions",
      label: "New note",
      icon: NotebookPen,
      keywords: "write page",
      run: () => go("notes", { kind: "note", id: useStore.getState().addNote() }),
    });
    const dark = settings.theme === "dark" || (settings.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    out.push({
      id: "a:theme",
      group: "Actions",
      label: dark ? "Switch to light paper" : "Switch to night reading",
      icon: dark ? Sun : Moon,
      keywords: "theme dark light mode",
      run: () => useStore.getState().updateSettings({ theme: dark ? "light" : "dark" }),
    });
    out.push({
      id: "a:nowbar",
      group: "Actions",
      label: settings.nowBar ? "Hide the Now Bar" : "Show the Now Bar",
      icon: PanelBottom,
      keywords: "floating bar",
      run: () => {
        useStore.getState().updateSettings({ nowBar: !settings.nowBar });
        setNowBarVisible(!settings.nowBar);
      },
    });
    out.push({ id: "a:keys", group: "Actions", label: "Keyboard shortcuts", hint: "?", icon: Keyboard, keywords: "help keys", run: () => (setPalette(false), setHelp(true)) });

    out.push({ id: "g:today", group: "Go to", label: "Today", hint: "G T", icon: Sun, run: () => go("today") });
    out.push({ id: "g:inbox", group: "Go to", label: "Inbox", hint: "G I", icon: Inbox, keywords: "email mail", run: () => go("inbox") });
    out.push({ id: "g:study", group: "Go to", label: "Study", hint: "G S", icon: GraduationCap, keywords: "courses exams flashcards", run: () => go("study") });
    out.push({ id: "g:notes", group: "Go to", label: "Notes", hint: "G N", icon: BookOpen, keywords: "write pages", run: () => go("notes") });
    out.push({ id: "g:settings", group: "Go to", label: "Settings", hint: "G ,", icon: Settings, keywords: "preferences", run: () => go("settings") });

    tasks
      .filter((t) => !t.done && t.date >= d)
      .sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? 9999) - (b.start ?? 9999))
      .forEach((t) =>
        out.push({
          id: `t:${t.id}`,
          group: "Tasks",
          label: t.title,
          hint: `${formatDay(t.date, d)}${t.fixed && t.start !== null ? ` · ${formatTime(t.start)}` : ""}`,
          icon: t.date === d ? CheckCircle2 : CalendarDays,
          keywords: t.category,
          run: () => go("today", { kind: "task", id: t.id }),
        }),
      );

    [...needsYou, ...rest].forEach(({ message, suggestion }) =>
      out.push({
        id: `e:${message.id}`,
        group: "Email",
        label: message.subject || "(no subject)",
        hint: message.fromName || message.fromAddress,
        icon: Mail,
        keywords: `${message.fromName} ${message.fromAddress} ${suggestion ? "needs you" : ""}`,
        run: () => go("inbox", { kind: "email", id: message.id }),
      }),
    );

    notes.forEach((n) =>
      out.push({ id: `n:${n.id}`, group: "Notes", label: noteTitle(n.title, n.body), icon: NotebookPen, keywords: n.body.slice(0, 400), run: () => go("notes", { kind: "note", id: n.id }) }),
    );
    courses.forEach((c) =>
      out.push({ id: `c:${c.id}`, group: "Courses", label: c.name, hint: `Exam ${formatDay(c.examDate, d)}`, icon: GraduationCap, run: () => go("study", { kind: "course", id: c.id }) }),
    );
    return out;
  }, [tasks, notes, courses, settings, focus, needsYou, rest, d, go, capture, setPalette, setHelp]);

  const results = useMemo(() => {
    const q = query.trim();
    const scored = items.map((it) => ({ it, s: score(it, q) })).filter((x) => x.s > 0);
    if (!q) return scored.filter((x) => x.it.group === "Actions" || x.it.group === "Go to" || x.it.group === "Tasks").slice(0, 14).map((x) => x.it);
    const order = ["Actions", "Go to", "Tasks", "Email", "Notes", "Courses"];
    return scored
      .sort((a, b) => b.s - a.s || order.indexOf(a.it.group) - order.indexOf(b.it.group))
      .slice(0, 30)
      .map((x) => x.it)
      .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  }, [items, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (it: Item | undefined) => {
    if (!it) return;
    setPalette(false);
    it.run();
    if (it.group === "Actions" && it.id !== "a:keys" && it.id !== "a:capture" && it.id !== "a:note") toast("Done");
  };

  let lastGroup = "";
  return (
    <div className="overlay palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && setPalette(false)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command menu">
        <div className="palette-input">
          <Search size={18} aria-hidden="true" />
          <input
            autoFocus
            value={query}
            placeholder="Search tasks, email, notes, or type a command…"
            aria-label="Search or run a command"
            aria-controls="palette-list"
            aria-activedescendant={results[active] ? `pi-${results[active].id}` : undefined}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(results[active]);
              } else if (e.key === "Escape") {
                setPalette(false);
              }
            }}
          />
          <span className="kbd">esc</span>
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {results.length === 0 && <p className="palette-empty">Nothing matches “{query}”.</p>}
          {results.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {header && <div className="palette-group">{header}</div>}
                <div
                  id={`pi-${it.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  className="palette-item"
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(it)}
                >
                  <it.icon size={16} aria-hidden="true" />
                  <span className="truncate label">{it.label}</span>
                  {it.hint && <span className="hint-text">{it.hint}</span>}
                  {i === active && <ArrowRight size={14} className="go" aria-hidden="true" />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span>
            <span className="kbd">↑</span> <span className="kbd">↓</span> to move
          </span>
          <span>
            <span className="kbd">↵</span> to open
          </span>
          <span className="spacer" />
          <span>Searches everything on this computer</span>
        </div>
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string[]][] = [
  ["Command menu & search", ["⌘/Ctrl", "K"]],
  ["Search", ["/"]],
  ["Plan something new", ["C"]],
  ["Quick capture from any app", ["⌘/Ctrl", "Shift", "Space"]],
  ["Go to Today · Inbox · Study · Notes", ["G", "then T · I · S · N"]],
  ["Move through tasks or emails", ["J", "K"]],
  ["Mark done · Add email to plan", ["E", "A"]],
  ["Start focus on selected task", ["F"]],
  ["Draft a reply", ["R"]],
  ["This list", ["?"]],
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="keys-title" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <h2 id="keys-title">Keyboard shortcuts</h2>
        <p className="muted" style={{ margin: "0 0 16px" }}>
          Kindred is fastest from the keyboard.
        </p>
        <div className="list">
          {SHORTCUTS.map(([label, keys]) => (
            <div className="list-item" key={label}>
              <span style={{ flex: 1 }}>{label}</span>
              <span className="row" style={{ gap: 4 }}>
                {keys.map((k) => (
                  <span className="kbd" key={k}>
                    {k}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" className="btn primary" autoFocus onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
