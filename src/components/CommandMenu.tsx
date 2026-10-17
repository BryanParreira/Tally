import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Inbox,
  Keyboard,
  Mail,
  Moon,
  NotebookPen,
  Search,
  Settings,
  Sparkles,
  Sun,
  Hash,
} from "lucide-react";
import { formatDay, formatTime } from "../lib/date";
import { useMailItems } from "../lib/mailSuggestions";
import { useNav } from "../lib/nav";
import { noteTitle } from "../lib/notes";
import { extractTags } from "../lib/parse";
import { planFor, today, useStore } from "../lib/store";
import { currentAndNext } from "../lib/schedule";
import { minutesOfDay } from "../lib/date";
import { useToast } from "../lib/hooks";

interface Item {
  id: string;
  group: "Actions" | "Go to" | "Tags" | "Tasks" | "Email" | "Notes";
  /** Keep the menu open after running (tags refine the search instead). */
  keep?: boolean;
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
  const settings = useStore((s) => s.settings);
  const events = useStore((s) => s.events);
  const { needsYou, rest } = useMailItems();
  const toast = useToast((s) => s.show);
  const [query, setQuery] = useState(() => useNav.getState().paletteQuery);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const d = today();

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const now = new Date();
    const { current } = currentAndNext(planFor({ tasks, settings, events }, d, now), minutesOfDay(now));

    out.push({ id: "a:capture", group: "Actions", label: "Plan something new", hint: "C T", icon: Sparkles, keywords: "add task brain dump capture", run: capture });
    if (current?.task && !current.task.done)
      out.push({ id: "a:done", group: "Actions", label: `Mark done: ${current.task.title}`, icon: CheckCircle2, keywords: "finish complete now", run: () => useStore.getState().toggleDone(current.task!.id, current.start) });
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
      label: dark ? "Switch to light theme" : "Switch to dark theme",
      icon: dark ? Sun : Moon,
      keywords: "theme dark light mode",
      run: () => useStore.getState().updateSettings({ theme: dark ? "light" : "dark" }),
    });
    out.push({ id: "a:keys", group: "Actions", label: "Keyboard shortcuts", hint: "?", icon: Keyboard, keywords: "help keys", run: () => (setPalette(false), setHelp(true)) });

    out.push({ id: "g:today", group: "Go to", label: "Today", hint: "G H", icon: Sun, keywords: "home plan", run: () => go("today") });
    out.push({ id: "g:inbox", group: "Go to", label: "Inbox", hint: "G I", icon: Inbox, keywords: "email mail signal noise", run: () => go("inbox") });
    out.push({ id: "g:tasks", group: "Go to", label: "Tasks", hint: "G T", icon: CheckCircle2, keywords: "board list someday backlog", run: () => go("tasks") });
    out.push({ id: "g:calendar", group: "Go to", label: "Calendar", hint: "G R", icon: CalendarDays, keywords: "week schedule events", run: () => go("calendar") });
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
          keywords: `${t.category} ${(t.tags ?? []).map((x) => `#${x}`).join(" ")}`,
          run: () => go("tasks", { kind: "task", id: t.id }),
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
      out.push({
        id: `n:${n.id}`,
        group: "Notes",
        label: noteTitle(n.title, n.body),
        icon: NotebookPen,
        keywords: `${extractTags(`${n.title} ${n.body}`).map((x) => `#${x}`).join(" ")} ${n.body.slice(0, 2000)}`,
        run: () => go("notes", { kind: "note", id: n.id }),
      }),
    );

    // One tag namespace across tasks and notes.
    const tagCounts = new Map<string, number>();
    for (const t of tasks) if (!t.done) for (const tag of t.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    for (const n of notes) for (const tag of extractTags(`${n.title} ${n.body}`)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([tag, count]) =>
        out.push({ id: `tag:${tag}`, group: "Tags", label: `#${tag}`, hint: `${count} ${count === 1 ? "item" : "items"}`, icon: Hash, keep: true, run: () => setQuery(`#${tag} `) }),
      );
    return out;
  }, [tasks, notes, settings, events, needsYou, rest, d, go, capture, setPalette, setHelp]);

  const results = useMemo(() => {
    const q = query.trim();
    const scored = items.map((it) => ({ it, s: score(it, q) })).filter((x) => x.s > 0);
    if (!q) return scored.filter((x) => x.it.group === "Actions" || x.it.group === "Go to" || x.it.group === "Tasks").slice(0, 14).map((x) => x.it);
    const order = ["Tags", "Actions", "Go to", "Tasks", "Email", "Notes"];
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
    if (it.keep) return it.run();
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
  ["Create a task · note · snippet", ["C", "then T · N · S"]],
  ["Insert a snippet while writing a note", [";"]],
  ["Quick capture from any app", ["⌘/Ctrl", "Shift", "Space"]],
  ["Go to Today · Inbox · Tasks · Calendar · Notes", ["G", "then H · I · T · R · N"]],
  ["Collapse the sidebar · Settings", ["⌘/Ctrl", ". · ;"]],
  ["Move through tasks or emails", ["J", "K"]],
  ["Mark done · Accept an inbox item", ["E", "A"]],
  ["Preview an inbox item", ["Space"]],
  ["Change a task's priority · status", ["P", "S"]],
  ["Open task details", ["Enter"]],
  ["Calendar: day · week · month · today", ["D", "W", "M", "T"]],
  ["Calendar: previous · next · create", ["K", "J", "C"]],
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

interface CreateOption {
  key: string;
  label: string;
  hint: string;
  icon: typeof Search;
  run(): void;
}

/** Press c, then a letter: the fastest way to make anything. */
export function CreateLauncher() {
  const { go, capture, setLauncher } = useNav.getState();
  const options: CreateOption[] = [
    { key: "t", label: "Task", hint: "Plan something new", icon: CheckCircle2, run: capture },
    { key: "n", label: "Note", hint: "A fresh page", icon: NotebookPen, run: () => go("notes", { kind: "note", id: useStore.getState().addNote() }) },
    { key: "s", label: "Snippet", hint: "A reusable template for ;", icon: Sparkles, run: () => go("notes", { kind: "snippet", id: useStore.getState().addSnippet() }) },
  ];
  const pick = (o: CreateOption) => {
    setLauncher(false);
    o.run();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setLauncher(false);
      const o = options.find((x) => x.key === e.key.toLowerCase());
      if (o) {
        e.preventDefault();
        e.stopPropagation();
        pick(o);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <div className="overlay palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && setLauncher(false)}>
      <div className="palette launcher" role="dialog" aria-modal="true" aria-label="Create">
        <div className="palette-group" style={{ padding: "16px 18px 8px" }}>
          Create
        </div>
        <div className="launcher-grid">
          {options.map((o) => (
            <button key={o.key} type="button" className="launcher-item" onClick={() => pick(o)}>
              <o.icon size={18} aria-hidden="true" />
              <span className="launcher-text">
                <span className="label">{o.label}</span>
                <span className="hint-text">{o.hint}</span>
              </span>
              <span className="kbd">{o.key.toUpperCase()}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
