import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  Star,
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Lock,
  Mail,
  PenLine,
  Plus,
  RefreshCw,
  Settings2,
  RotateCcw,
  ShieldCheck,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { Avatar, Modal } from "../components/ui";
import { EmailBody } from "../components/EmailBody";
import { addDays, daysBetween, dueLabel, formatDay, formatDuration, fromKey } from "../lib/date";
import { relativeTime, useToast } from "../lib/hooks";
import { PROVIDERS, draftReply, isMicrosoftAddress, mailtoLink, type MailSuggestion } from "../lib/mail";
import { domainProvider, isDesktop, mailConnect, openExternal, outlookConnect } from "../lib/native";
import { inboxName, mailErrorText, syncAllInboxes, syncInbox, useMailSync } from "../lib/mailSync";
import { spring } from "../lib/motion";
import { isTyping, reveal, useNav } from "../lib/nav";
import { MAIL_COLORS, restoreDeletedTask, tomorrowOf, today, useStore } from "../lib/store";
import { buildTriage, groupByBucket, groupByDate, VIEW_BUCKETS, type InboxView as View, type TriageItem } from "../lib/triage";
import type { MailAccount, MailMessage } from "../lib/types";
import { findNoteTasks } from "../lib/notes";

/** Everything in the inbox, sorted into what it asks of you. */
export function useTriage() {
  const mail = useStore((s) => s.mail);
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const triageDone = useStore((s) => s.triageDone);
  return useMemo(() => buildTriage({ mail, tasks, notes, triageDone }, today()), [mail, tasks, notes, triageDone]);
}

const KIND_ICON = { email: Mail, carried: RotateCcw, note: BookOpen };
const VIEWS: { id: View; label: string }[] = [
  { id: "all", label: "All" },
  { id: "important", label: "Important" },
  { id: "waiting", label: "Waiting" },
  { id: "other", label: "Other" },
];

/** Mark a sender important or not, with Undo. Your call always beats Kindred's guess. */
function useSenderRule() {
  const toast = useToast((s) => s.show);
  return (item: TriageItem, rule: "important" | "other" | null) => {
    if (!item.message) return;
    const address = item.message.fromAddress;
    const name = item.message.fromName || address;
    const before = item.rule ?? null;
    useStore.getState().setSenderRule(address, rule);
    toast(rule === "important" ? `${name} is important` : rule === "other" ? `${name} goes to Other` : `Kindred decides for ${name} again`, {
      label: "Undo",
      run: () => useStore.getState().setSenderRule(address, before),
    });
  };
}

/** Where "Schedule" and "Wait" can send something, relative to today. */
function scheduleChoices(d: string) {
  const wd = fromKey(d).getDay();
  const monday = addDays(d, ((8 - wd) % 7) || 7);
  return [
    { label: "Tomorrow", date: tomorrowOf(d) as string | null },
    { label: `Next week (${formatDay(monday, d)})`, date: monday as string | null },
    { label: "Someday", date: null as string | null },
  ];
}
function waitChoices(d: string) {
  return [
    { label: "2 days", date: addDays(d, 2) },
    { label: "4 days", date: addDays(d, 4) },
    { label: "1 week", date: addDays(d, 7) },
  ];
}

type Menu = { itemId: string; kind: "schedule" | "wait"; x: number; y: number };

export function InboxView() {
  const accounts = useStore((s) => s.mail.accounts);
  const lastSync = useStore((s) => s.mail.lastSync);
  const [inbox, setInbox] = useState<string>("all");
  const target = useNav((s) => s.target);
  const { all, signal } = useTriage();
  const [view, setView] = useState<View>("all");
  const senderRule = useSenderRule();
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState(true);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [connecting, setConnecting] = useState<false | true | MailAccount>(false);
  const syncingIds = useMailSync((s) => s.syncing);
  const progress = useMailSync((s) => s.progress);
  const toast = useToast((s) => s.show);
  const [draftFor, setDraftFor] = useState<{ message: MailMessage; suggestion: MailSuggestion | null } | null>(null);
  const actions = useInboxActions();
  const d = today();

  // One account selected: only its mail. "All inboxes": everything.
  const mine = inbox === "all" ? all : all.filter((i) => i.kind === "email" && i.message?.accountId === inbox);
  const countOf = (v: View) => mine.filter((i) => VIEW_BUCKETS[v].includes(i.bucket)).length;
  // "All" reads like a normal inbox (newest first, by day); the others group by what Kindred thinks each email asks.
  const groups =
    view === "all"
      ? groupByDate(mine.filter((i) => i.bucket !== "waiting"), d).map((g) => ({ bucket: g.label, label: g.label, items: g.items }))
      : groupByBucket(mine, view);
  const list = groups.flatMap((g) => g.items);
  const colorOf = (id?: string) => accounts.find((a) => a.id === id)?.color;
  const current = list.find((i) => i.id === selected) ?? null;

  // Keep a sensible selection as items are cleared.
  useEffect(() => {
    if (selected && !list.some((i) => i.id === selected)) setSelected(list[0]?.id ?? null);
  }, [list, selected]);

  // Arriving from a task's "From email" link.
  useEffect(() => {
    if (target?.kind !== "email") return;
    const id = `mail:${target.id}`;
    const it = all.find((i) => i.id === id);
    if (it) setView((Object.keys(VIEW_BUCKETS) as View[]).find((v) => VIEW_BUCKETS[v].includes(it.bucket)) ?? "important");
    setSelected(id);
    setPreview(true);
    reveal(`row-${id}`);
  }, [target]);

  const sync = async () => {
    if (!accounts.length) return;
    const one = accounts.find((a) => a.id === inbox);
    const { added, failed } = one ? await syncInbox(one).then((r) => ({ added: r.added, failed: r.error ? [one] : [] })) : await syncAllInboxes();
    if (failed.length === (one ? 1 : accounts.length)) toast(failed.length === 1 ? `Couldn't sync ${inboxName(failed[0])}` : "Couldn't sync your inboxes");
    else toast(added ? `${added} new ${added === 1 ? "email" : "emails"}` : "Up to date");
  };
  const busy = progress !== null || syncingIds.length > 0;
  const broken = accounts.filter((a) => a.error);
  const focused = accounts.find((a) => a.id === inbox);

  /** Run an action and move the selection to the next item. */
  const act = (item: TriageItem, run: () => void) => {
    const i = list.findIndex((x) => x.id === item.id);
    setSelected(list[i + 1]?.id ?? list[i - 1]?.id ?? null);
    setMenu(null);
    run();
  };
  const openMenu = (item: TriageItem, kind: Menu["kind"], el: HTMLElement | null) => {
    const r = el?.getBoundingClientRect();
    setMenu({ itemId: item.id, kind, x: r ? r.left : window.innerWidth / 2, y: r ? r.bottom + 4 : window.innerHeight / 3 });
  };

  // Keys: j/k move · t today · s schedule · w wait · e done · r reply · space preview · enter open · 1-3 views.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (isTyping(ev) || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const nav = useNav.getState();
      if (nav.palette || nav.launcher || document.querySelector(".modal")) return;
      if (menu && ev.key === "Escape") return setMenu(null);
      const i = list.findIndex((x) => x.id === selected);
      const item = list[i];
      if (["j", "k", "ArrowDown", "ArrowUp"].includes(ev.key)) {
        if (!list.length) return;
        ev.preventDefault();
        const down = ev.key === "j" || ev.key === "ArrowDown";
        const n = list[i < 0 ? 0 : Math.min(list.length - 1, Math.max(0, i + (down ? 1 : -1)))];
        setSelected(n.id);
        reveal(`row-${n.id}`);
      } else if (ev.key === "i" && item?.message) {
        senderRule(item, item.rule === "important" ? null : "important");
      } else if (["1", "2", "3", "4"].includes(ev.key)) {
        setView(VIEWS[Number(ev.key) - 1].id);
      } else if (ev.key === " " && item) {
        ev.preventDefault();
        setPreview(!preview);
      } else if (ev.key === "e" && item) {
        act(item, () => actions.done(item));
      } else if (ev.key === "t" && item) {
        act(item, () => actions.today(item));
      } else if (ev.key === "s" && item && item.kind !== "note") {
        ev.preventDefault();
        openMenu(item, "schedule", document.querySelector(`#row-${CSS.escape(item.id)} [data-act="schedule"]`));
      } else if (ev.key === "w" && item?.kind === "email") {
        ev.preventDefault();
        openMenu(item, "wait", document.querySelector(`#row-${CSS.escape(item.id)} [data-act="wait"]`));
      } else if (ev.key === "r" && item?.message) {
        ev.preventDefault();
        setDraftFor({ message: item.message, suggestion: item.suggestion ?? null });
      } else if (ev.key === "Enter" && item) {
        actions.open(item);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const menuItem = menu ? all.find((i) => i.id === menu.itemId) : undefined;

  return (
    <div className="mail">
      {/* Left: the list, with its own quiet toolbar. */}
      <section className={`mail-list${preview && current ? " has-pane" : ""}`} aria-label="Inbox">
        <header className="mail-head">
          <div className="mail-head-row">
            <h1 className="mail-title">Inbox</h1>
            <span className="mail-sub">{busy ? "Syncing…" : signal.length ? `${signal.length} need you` : "All clear"}</span>
            <span className="spacer" />
            {accounts.length > 1 && (
              <select className="mail-account" value={inbox} onChange={(e) => setInbox(e.target.value)} aria-label="Show inbox">
                <option value="all">All inboxes</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {inboxName(a)}
                    {a.error ? " (needs attention)" : ""}
                  </option>
                ))}
              </select>
            )}
            {accounts.length > 0 && (
              <button
                type="button"
                className="icon-btn"
                onClick={sync}
                disabled={busy}
                title={progress && progress.total > 1 ? `Syncing ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : lastSync ? `Sync · last ${relativeTime(lastSync)}` : "Sync"}
                aria-label="Sync"
              >
                <RefreshCw size={15} className={busy ? "spin" : undefined} />
              </button>
            )}
            <button type="button" className="icon-btn" onClick={() => setConnecting(true)} title={accounts.length ? "Add inbox" : "Connect email"} aria-label="Add inbox">
              <Plus size={16} />
            </button>
          </div>
          <nav className="seg-tabs" aria-label="Inbox views">
            {VIEWS.map((v, i) => (
              <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)} title={`${v.label} (${i + 1})`}>
                {view === v.id && <motion.span layoutId="mail-tab" className="seg-thumb" transition={spring} />}
                <span className="seg-label">
                  {v.label}
                  {countOf(v.id) > 0 && <span className="seg-count">{countOf(v.id)}</span>}
                </span>
              </button>
            ))}
          </nav>
          {broken.map((a) => (
            <div key={a.id} className="mail-alert" role="alert">
              <AlertCircle size={14} aria-hidden="true" />
              <span className="truncate" title={a.error ?? ""}>
                {inboxName(a)} can't sync
              </span>
              <span className="spacer" />
              <button type="button" className="btn sm" onClick={() => setConnecting(a)}>
                Reconnect
              </button>
            </div>
          ))}
          {focused && !focused.error && (
            <p className="mail-status">
              <span className="dot" style={{ background: focused.color }} aria-hidden="true" />
              <span className="truncate">{focused.username}</span>
              <button type="button" className="link-btn" onClick={() => useNav.getState().go("settings")}>
                <Settings2 size={12} /> Manage
              </button>
            </p>
          )}
        </header>

        <div className="mail-scroll" role="listbox" aria-label={VIEWS.find((v) => v.id === view)!.label}>
          {list.length === 0 && <EmptyInbox view={view} connected={accounts.length > 0} onConnect={() => setConnecting(true)} />}
          {groups.map((g) => (
            <section key={g.bucket}>
              <h2 className="mail-group">{g.label}</h2>
              <AnimatePresence initial={false} mode="popLayout">
                {g.items.map((item) => {
                  const Icon = KIND_ICON[item.kind];
                  const due = item.bucket === "deadline" && item.suggestion?.due;
                  return (
                    <motion.div
                      key={item.id}
                      id={`row-${item.id}`}
                      role="option"
                      aria-selected={item.id === selected}
                      className={`mail-row${item.id === selected ? " is-selected" : ""}`}
                      layout="position"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 24, transition: { duration: 0.16 } }}
                      transition={spring}
                      onClick={() => {
                        setSelected(item.id);
                        setPreview(true);
                      }}
                      onDoubleClick={() => actions.open(item)}
                    >
                      <Avatar name={item.from} size={32} icon={item.kind === "email" ? undefined : <Icon size={14} />} />
                      <div className="mail-row-body">
                        <div className="mail-row-top">
                          <span className="mail-from truncate">{item.from}</span>
                          {accounts.length > 1 && item.message && <span className="dot" style={{ background: colorOf(item.message.accountId) }} title={inboxName(accounts.find((a) => a.id === item.message!.accountId) ?? { username: "", host: "" })} aria-hidden="true" />}
                          <span className={`mail-time${due ? " is-due" : ""}`}>
                            {item.bucket === "waiting" && item.waitingUntil ? `Back ${formatDay(item.waitingUntil, d).toLowerCase()}` : due ? dueLabel(due, d) : item.kind === "email" ? relativeTime(item.time) : ""}
                          </span>
                        </div>
                        <div className="mail-subject-row">
                          {view === "all" && <BucketTag item={item} />}
                          <span className="mail-subject truncate">{item.title}</span>
                        </div>
                        <div className="mail-preview truncate">{item.message ? item.message.text.replace(/\s+/g, " ").slice(0, 160) || item.detail : item.detail}</div>
                      </div>
                      <RowActions item={item} onToday={() => act(item, () => actions.today(item))} onDone={() => act(item, () => actions.done(item))} onMenu={(kind, el) => openMenu(item, kind, el)} />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </section>
          ))}
        </div>
      </section>

      {/* Right: the reading pane, or a calm empty state. */}
      <section className={`mail-pane${preview && current ? " is-open" : ""}`} aria-label="Reading pane">
        {current && preview ? (
          <Pane
            item={current}
            onToday={() => act(current, () => actions.today(current))}
            onDone={() => act(current, () => actions.done(current))}
            onMenu={(kind, el) => openMenu(current, kind, el)}
            onDraft={(message, suggestion) => setDraftFor({ message, suggestion })}
            onClose={() => setPreview(false)}
            onSender={(rule) => senderRule(current, rule)}
          />
        ) : (
          <div className="mail-pane-empty">
            <Mail size={22} aria-hidden="true" />
            <p>{list.length ? "Select something to read it" : "Nothing here"}</p>
            {list.length > 0 && (
              <p className="hint">
                <span className="kbd">J</span> <span className="kbd">K</span> to move · <span className="kbd">T</span> today · <span className="kbd">E</span> done
              </p>
            )}
          </div>
        )}
      </section>

      {menu && menuItem && (
        <QuickMenu
          x={menu.x}
          y={menu.y}
          title={menu.kind === "schedule" ? "Plan it for" : "Wait for a reply until"}
          choices={menu.kind === "schedule" ? scheduleChoices(d) : waitChoices(d)}
          onClose={() => setMenu(null)}
          onPick={(date) => act(menuItem, () => (menu.kind === "schedule" ? actions.schedule(menuItem, date) : actions.wait(menuItem, date!)))}
        />
      )}
      {connecting && (
        <Modal onClose={() => setConnecting(false)} labelledBy="connect-title">
          <ConnectForm reconnect={typeof connecting === "object" ? connecting : undefined} onDone={() => setConnecting(false)} />
        </Modal>
      )}
      {draftFor && <DraftModal message={draftFor.message} suggestion={draftFor.suggestion} onClose={() => setDraftFor(null)} />}
    </div>
  );
}

function EmptyInbox({ view, connected, onConnect }: { view: View; connected: boolean; onConnect: () => void }) {
  const copy: Record<View, [string, string]> = {
    all: ["Inbox zero", "New email, unfinished work and tasks from your notes show up here. Nothing is hidden in this view."],
    important: ["You're all caught up", "Emails that need a reply or have a deadline, unfinished work and tasks from your notes show up here."],
    waiting: ["Not waiting on anyone", "Press W on an email you're expecting an answer to. It comes back here if nobody replies."],
    other: ["Nothing else", "Updates, newsletters and emails that don't ask anything of you land here."],
  };
  return (
    <div className="empty">
      <span className="glyph">
        <Check size={20} aria-hidden="true" />
      </span>
      <h3>{copy[view][0]}</h3>
      <p>{copy[view][1]}</p>
      {!connected && view === "important" && (
        <button type="button" className="btn" style={{ marginTop: 18 }} onClick={onConnect}>
          <Mail size={15} /> Connect email
        </button>
      )}
    </div>
  );
}

/** In "All", a quiet tag that says what Kindred thinks an email asks of you. */
function BucketTag({ item }: { item: TriageItem }) {
  const d = today();
  if (item.bucket === "reply") return <span className="btag is-reply">Reply</span>;
  if (item.bucket === "deadline") return <span className="btag is-due">{item.suggestion?.due ? dueLabel(item.suggestion.due, d) : "Deadline"}</span>;
  if (item.bucket === "vip") return <Star size={12} className="btag-star" fill="currentColor" aria-label="Important sender" />;
  if (item.bucket === "todo") return <span className="btag">To do</span>;
  return null;
}

/** The four decisions, on every row: plan it today, schedule it, wait for a reply, or clear it. */
function RowActions({ item, onToday, onDone, onMenu }: { item: TriageItem; onToday: () => void; onDone: () => void; onMenu: (kind: Menu["kind"], el: HTMLElement) => void }) {
  const stop = (fn: (e: React.MouseEvent<HTMLButtonElement>) => void) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    fn(e);
  };
  return (
    <div className="row-actions">
      <button type="button" className="icon-btn" data-act="today" title={item.kind === "carried" ? "Keep it today (T)" : "Do it today (T)"} aria-label="Today" onClick={stop(onToday)}>
        <Sun size={15} />
      </button>
      {item.kind !== "note" && (
        <button type="button" className="icon-btn" data-act="schedule" title="Schedule (S)" aria-label="Schedule" onClick={stop((e) => onMenu("schedule", e.currentTarget))}>
          <CalendarClock size={15} />
        </button>
      )}
      {item.kind === "email" && (
        <button type="button" className="icon-btn" data-act="wait" title="Wait for a reply (W)" aria-label="Wait for a reply" onClick={stop((e) => onMenu("wait", e.currentTarget))}>
          <Clock size={15} />
        </button>
      )}
      <button type="button" className="icon-btn" data-act="done" title="Done (E)" aria-label="Done" onClick={stop(onDone)}>
        <Check size={15} />
      </button>
    </div>
  );
}

function QuickMenu({
  x,
  y,
  title,
  choices,
  onPick,
  onClose,
}: {
  x: number;
  y: number;
  title: string;
  choices: { label: string; date: string | null }[];
  onPick: (date: string | null) => void;
  onClose: () => void;
}) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The menu owns the keyboard while it's open; nothing behind it reacts.
      e.stopImmediatePropagation();
      if (e.key === "ArrowDown" || e.key === "j") (e.preventDefault(), setActive((a) => (a + 1) % choices.length));
      else if (e.key === "ArrowUp" || e.key === "k") (e.preventDefault(), setActive((a) => (a - 1 + choices.length) % choices.length));
      else if (e.key === "Enter") (e.preventDefault(), onPick(choices[active].date));
      else if (e.key === "Escape") (e.preventDefault(), onClose());
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });
  return (
    <>
      <div className="popover-catcher" onMouseDown={onClose} />
      <motion.div
        className="quick-menu"
        role="menu"
        style={{ left: Math.min(x, window.innerWidth - 232), top: Math.min(y, window.innerHeight - 180) }}
        initial={{ opacity: 0, y: -4, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring}
      >
        <div className="quick-menu-title">{title}</div>
        {choices.map((c, i) => (
          <button key={c.label} type="button" role="menuitem" className="quick-menu-item" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => onPick(c.date)}>
            {c.label}
          </button>
        ))}
      </motion.div>
    </>
  );
}

/** What each decision does for each kind of inbox item, with Undo for all of them. */
export function useInboxActions() {
  const toast = useToast((s) => s.show);
  return useMemo(() => {
    const unhandle = (id: string) => useStore.setState((s) => ({ mail: { ...s.mail, handled: s.mail.handled.filter((x) => x !== id) } }));
    return {
      today(item: TriageItem) {
        const s = useStore.getState();
        const d = today();
        if (item.kind === "email" && item.message) {
          const m = item.message;
          const task = s.planMail(m, d);
          toast(`Added to Today: ${task.title}`, { label: "Undo", run: () => (useStore.getState().deleteTask(task.id), unhandle(m.id)) });
        } else if (item.kind === "carried") {
          s.markTriaged(item.id);
          toast("Kept on today's plan", { label: "Undo", run: () => useStore.getState().untriage(item.id) });
        } else if (item.kind === "note") {
          const n = s.planNoteTasks(item.noteId!);
          toast(n === 1 ? "Added to Today" : `Added ${n} tasks to Today`);
        }
      },
      schedule(item: TriageItem, date: string | null) {
        const s = useStore.getState();
        const d = today();
        const when = date ? formatDay(date, d) : "Someday";
        if (item.kind === "email" && item.message) {
          const m = item.message;
          const task = s.planMail(m, date);
          toast(`Planned for ${when.toLowerCase()}`, { label: "Undo", run: () => (useStore.getState().deleteTask(task.id), unhandle(m.id)) });
        } else if (item.kind === "carried" && item.taskId) {
          const before = s.tasks.find((t) => t.id === item.taskId);
          if (date) s.moveTasks([item.taskId], date);
          else s.updateTask(item.taskId, { someday: true });
          s.markTriaged(item.id);
          toast(`Moved to ${when.toLowerCase()}`, {
            label: "Undo",
            run: () => {
              const st = useStore.getState();
              if (before) st.updateTask(before.id, { date: before.date, someday: before.someday, start: before.start });
              st.untriage(item.id);
            },
          });
        }
      },
      wait(item: TriageItem, until: string) {
        if (item.kind !== "email" || !item.message) return;
        const id = item.message.id;
        useStore.getState().setWaiting(id, until);
        toast(`Waiting for a reply until ${formatDay(until, today()).toLowerCase()}`, { label: "Undo", run: () => useStore.getState().setWaiting(id, null) });
      },
      done(item: TriageItem) {
        const s = useStore.getState();
        if (item.kind === "email" && item.message) {
          const id = item.message.id;
          s.handleMail(id);
          s.setWaiting(id, null);
          toast("Done", { label: "Undo", run: () => unhandle(id) });
        } else {
          s.markTriaged(item.id);
          toast("Done", { label: "Undo", run: () => useStore.getState().untriage(item.id) });
        }
      },
      open(item: TriageItem) {
        const go = useNav.getState().go;
        if (item.kind === "carried") go("today", { kind: "task", id: item.taskId! });
        else if (item.kind === "note") go("notes", { kind: "note", id: item.noteId! });
      },
    };
  }, [toast]);
}

function Pane({
  item,
  onToday,
  onDone,
  onMenu,
  onDraft,
  onClose,
  onSender,
}: {
  item: TriageItem;
  onToday: () => void;
  onDone: () => void;
  onMenu: (kind: Menu["kind"], el: HTMLElement) => void;
  onDraft: (m: MailMessage, s: MailSuggestion | null) => void;
  onClose: () => void;
  onSender: (rule: "important" | "other" | null) => void;
}) {
  const toast = useToast((s) => s.show);
  const d = today();
  // The toolbar sits on top like a native mail app: decisions left, close right.
  const bar = (
    <div className="pane-toolbar">
      <button type="button" className="tool primary" onClick={onToday} title="Add to today (T)">
        <Sun size={15} /> <span>Today</span>
      </button>
      {item.kind !== "note" && (
        <button type="button" className="tool" onClick={(e) => onMenu("schedule", e.currentTarget)} title="Schedule (S)">
          <CalendarClock size={15} /> <span>Schedule</span>
        </button>
      )}
      {item.message && (
        <>
          <button type="button" className="tool" onClick={(e) => onMenu("wait", e.currentTarget)} title="Wait for a reply (W)">
            <Clock size={15} /> <span>Wait</span>
          </button>
          <button type="button" className="tool" onClick={() => onDraft(item.message!, item.suggestion ?? null)} title="Reply (R)">
            <PenLine size={15} /> <span>Reply</span>
          </button>
        </>
      )}
      {item.message && (
        <button
          type="button"
          className={`tool${item.rule === "important" ? " is-on" : ""}`}
          onClick={() => onSender(item.rule === "important" ? null : "important")}
          title={item.rule === "important" ? "Marked important (I)" : "Always treat this sender as important (I)"}
        >
          <Star size={15} fill={item.rule === "important" ? "currentColor" : "none"} />
          <span>{item.rule === "important" ? "Important" : "Mark important"}</span>
        </button>
      )}
      <button type="button" className="tool" onClick={onDone} title="Done (E)">
        <Check size={15} /> <span>Done</span>
      </button>
      <span className="spacer" />
      <button type="button" className="icon-btn" aria-label="Close" title="Close" onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  );

  if (item.kind === "email" && item.message) {
    const m = item.message;
    const s = item.suggestion;
    return (
      <article className="pane-body" key={item.id}>
        {bar}
        <div className="pane-content">
          <h2 className="pane-title">{m.subject || "(no subject)"}</h2>
          <div className="pane-sender">
            <Avatar name={item.from} size={36} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="pane-sender-name truncate">{m.fromName || m.fromAddress}</div>
              <div className="pane-sender-meta truncate">{m.fromAddress}</div>
            </div>
            <span className="pane-date">{new Date(m.date).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          </div>
          {/* Why it's where it is, and a one-click way to correct Kindred. */}
          <div className="pane-insight">
            <span className={`insight-dot is-${item.rule === "important" ? "vip" : item.rule === "other" ? "other" : (s?.kind ?? "other")}`} aria-hidden="true" />
            <span>
              {item.rule === "important"
                ? "You marked this sender important"
                : item.rule === "other"
                  ? "You marked this sender not important"
                  : s
                    ? `Kindred thinks this ${s.kind === "request" ? "asks you something" : s.kind === "deadline" ? "has a deadline" : "is an invitation"}${s.due ? ` · ${dueLabel(s.due, d).toLowerCase()}` : ""}`
                    : m.bulk
                      ? "Looks like a newsletter or update"
                      : "Kindred didn't spot a question or deadline"}
            </span>
            <span className="spacer" />
            {item.rule ? (
              <button type="button" className="link-btn" onClick={() => onSender(null)}>
                Let Kindred decide
              </button>
            ) : s ? (
              <button type="button" className="link-btn" onClick={() => onSender("other")}>
                Not important
              </button>
            ) : (
              <button type="button" className="link-btn" onClick={() => onSender("important")}>
                It is important
              </button>
            )}
          </div>
          <EmailBody message={m} account={useStore.getState().mail.accounts.find((a) => a.id === m.accountId)} />
        </div>
      </article>
    );
  }

  if (item.kind === "carried") {
    const task = useStore.getState().tasks.find((t) => t.id === item.taskId);
    return (
      <article className="pane-body" key={item.id}>
        {bar}
        <p className="eyebrow" style={{ marginTop: 20 }}>
          Carried over
        </p>
        <h2 className="pane-title">{item.title}</h2>
        <p className="pane-text" style={{ marginTop: 10 }}>
          {item.detail} {task ? `It takes about ${formatDuration(task.duration)}.` : ""}
        </p>
        <div className="row wrap pane-actions">
          <button
            type="button"
            className="btn danger sm"
            onClick={() => {
              useStore.getState().deleteTask(item.taskId!);
              toast("Deleted", { label: "Undo", run: restoreDeletedTask });
            }}
          >
            <Trash2 size={14} /> Let it go
          </button>
        </div>
      </article>
    );
  }

  if (item.kind === "note") {
    const note = useStore.getState().notes.find((n) => n.id === item.noteId);
    const pending = note ? findNoteTasks(note.body, d) : [];
    return (
      <article className="pane-body" key={item.id}>
        {bar}
        <p className="eyebrow" style={{ marginTop: 20 }}>
          From your note
        </p>
        <h2 className="pane-title">{item.from}</h2>
        <div className="list" style={{ margin: "14px 0 6px" }}>
          {pending.map((p, i) => (
            <div className="list-item" key={i}>
              <span className={`dot ${p.item.category}`} aria-hidden="true" />
              <span className="list-title" style={{ flex: 1 }}>
                {p.item.title}
              </span>
              <span className="muted small">{p.item.due ? dueLabel(p.item.due, d) : formatDuration(p.item.duration)}</span>
            </div>
          ))}
        </div>
        <div className="row wrap pane-actions">
          <button type="button" className="btn sm" onClick={() => useNav.getState().go("notes", { kind: "note", id: item.noteId! })}>
            <BookOpen size={14} /> Open note <ArrowRight size={13} />
          </button>
        </div>
      </article>
    );
  }

  return null;
}

const NICKNAMES = ["Personal", "School", "Work"];

type ConnectPhase = "form" | "signing-in" | "reading" | "done";

/**
 * Add an inbox (or reconnect one whose password stopped working), showing each
 * step as it happens and what Kindred found at the end.
 */
export function ConnectForm({ onDone, reconnect }: { onDone: () => void; reconnect?: MailAccount }) {
  const accounts = useStore((s) => s.mail.accounts);
  const [providerId, setProviderId] = useState(reconnect?.provider ?? "gmail");
  const provider = PROVIDERS.find((p) => p.id === providerId) ?? PROVIDERS[PROVIDERS.length - 1];
  const [email, setEmail] = useState(reconnect?.username ?? "");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState(reconnect?.host ?? "");
  const [port, setPort] = useState(reconnect?.port ?? 993);
  const [name, setName] = useState(reconnect?.name ?? "");
  const [color, setColor] = useState<string | undefined>(reconnect?.color);
  const [phase, setPhase] = useState<ConnectPhase>("form");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ account: MailAccount; found: number; needs: number } | null>(null);
  const { addMailAccount, updateMailAccount } = useStore.getState();
  const toast = useToast((s) => s.show);

  const other = providerId === "other";
  const outlook = providerId === "outlook";
  // Known Microsoft addresses right away; any other school or company domain is looked up by its mail servers.
  const [hosted, setHosted] = useState<{ domain: string; provider: string } | null>(null);
  const domain = email.includes("@") ? email.split("@").pop()!.trim().toLowerCase() : "";
  useEffect(() => {
    if (reconnect || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return;
    const t = setTimeout(() => domainProvider(domain).then((provider) => provider && setHosted({ domain, provider })), 450);
    return () => clearTimeout(t);
  }, [domain, reconnect]);
  const detected = hosted?.domain === domain ? hosted.provider : isMicrosoftAddress(email) ? "outlook" : null;
  const suggestMicrosoft = !outlook && !reconnect && detected === "outlook";
  const suggestOther = !reconnect && detected && detected !== "outlook" && detected !== providerId ? PROVIDERS.find((p) => p.id === detected) : undefined;
  const fields = { provider: providerId, host: other ? host.trim() : provider.host, port: other ? port : provider.port, username: email.trim() };
  const duplicate = !reconnect && accounts.some((a) => a.username.toLowerCase() === fields.username.toLowerCase() && a.host === fields.host);
  const ready = outlook || (email.includes("@") && password.length > 0 && (!other || host.trim().length > 0) && !duplicate);
  const busy = phase === "signing-in" || phase === "reading";
  const used = new Set(accounts.filter((a) => a.id !== reconnect?.id).map((a) => a.color));
  const shownColor = color ?? MAIL_COLORS.find((c) => !used.has(c)) ?? MAIL_COLORS[0];

  const submit = async () => {
    setError(null);
    setPhase("signing-in");
    try {
      let username = fields.username;
      if (outlook) {
        // Microsoft accounts sign in in the browser; we learn the address afterwards.
        const me = await outlookConnect();
        username = me.email;
        if (reconnect && reconnect.username.toLowerCase() !== username.toLowerCase())
          throw new Error(`You signed in as ${username}. Sign in as ${reconnect.username} to reconnect this inbox.`);
        if (!reconnect && accounts.some((a) => a.provider === "outlook" && a.username.toLowerCase() === username.toLowerCase()))
          throw new Error("This inbox is already connected.");
      } else {
        // Rust only needs the connection details; id and colour are added once it works.
        await mailConnect({ ...fields, id: "", color: "" }, password);
        setPassword("");
      }
      let account: MailAccount;
      if (reconnect) {
        updateMailAccount(reconnect.id, { error: null, name: name.trim() || undefined, color: shownColor });
        account = { ...reconnect, error: null };
      } else {
        account = addMailAccount({ ...fields, username, name: name.trim() || undefined, color: shownColor });
      }
      setPhase("reading");
      const r = await syncInbox(account);
      const s = useStore.getState();
      const needs = buildTriage(s, today()).signal.filter((i) => i.message?.accountId === account.id).length;
      setResult({ account, found: r.found, needs });
      setPhase("done");
      toast(reconnect ? `${inboxName(account)} reconnected` : accounts.length ? "Inbox added" : "Email connected");
    } catch (err) {
      setError(mailErrorText(err));
      setPhase("form");
    }
  };

  if (phase === "done" && result) {
    return (
      <div className="stack connect-done" style={{ gap: 16 }}>
        <span className="connect-check" style={{ background: result.account.color }} aria-hidden="true">
          <Check size={22} strokeWidth={2.6} />
        </span>
        <div>
          <h2 id="connect-title">{reconnect ? `${inboxName(result.account)} is back` : `${inboxName(result.account)} is connected`}</h2>
          <p className="muted" style={{ margin: 0 }}>
            Found {result.found} {result.found === 1 ? "email" : "emails"} from the last 14 days
            {result.needs ? `, and ${result.needs} ${result.needs === 1 ? "needs" : "need"} you.` : ". Nothing needs you right now."} Kindred checks again every 10 minutes while
            it's open.
          </p>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {!reconnect && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setEmail("");
                setName("");
                setColor(undefined);
                setResult(null);
                setPhase("form");
              }}
            >
              <Plus size={15} /> Add another inbox
            </button>
          )}
          <button type="button" className="btn primary" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <h2 id="connect-title">{reconnect ? `Reconnect ${inboxName(reconnect)}` : accounts.length ? "Add another inbox" : "Connect your email"}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {reconnect
            ? "Enter a fresh app password. Your mail and settings stay as they are."
            : "Kindred reads recent mail on this computer, sorts it into Signal and Noise, and turns deadlines and requests into tasks. Add as many inboxes as you like."}
        </p>
      </div>
      {!reconnect && (
        <div className="field">
          <span className="label" id="provider-label">
            Email provider
          </span>
          <div className="providers" role="group" aria-labelledby="provider-label">
            {PROVIDERS.map((p) => (
              <button key={p.id} type="button" className="provider" aria-pressed={p.id === providerId} onClick={() => setProviderId(p.id)} disabled={busy}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {outlook ? (
        <div className="notice-box ms-box">
          <Lock size={16} aria-hidden="true" />
          <span>
            {reconnect ? `Sign in again as ${reconnect.username}.` : "You'll sign in with Microsoft in your browser, including your school's two-step check."} School accounts like
            @minnstate.edu work too. Kindred only asks to read your mail, and you never type your password here.
          </span>
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="mail-address">Email address</label>
            <input
              id="mail-address"
              className="input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              readOnly={!!reconnect}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
            {duplicate && <p className="hint error">This inbox is already connected.</p>}
          </div>
          <div className="field">
            <label htmlFor="mail-password">App password</label>
            <input
              id="mail-password"
              className="input"
              type="password"
              autoComplete="off"
              autoFocus={!!reconnect}
              placeholder="xxxx xxxx xxxx xxxx"
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ready && !busy && submit()}
            />
            <p className="hint">
              Most providers need an app password, not your normal one.{" "}
              {provider.help && (
                <button type="button" className="btn ghost sm" style={{ height: 22, padding: "0 4px" }} onClick={() => openExternal(provider.help)}>
                  Create one for {provider.label} <ExternalLink size={12} />
                </button>
              )}
            </p>
          </div>
        </>
      )}
      {suggestOther && (
        <div className="notice-box">
          <span style={{ flex: 1 }}>
            {domain} email is hosted by {suggestOther.label}.
          </span>
          <button type="button" className="btn sm" onClick={() => setProviderId(suggestOther.id)}>
            Use {suggestOther.label}
          </button>
        </div>
      )}
      {suggestMicrosoft && (
        <div className="notice-box">
          <span style={{ flex: 1 }}>{domain && !isMicrosoftAddress(email) ? `${domain} uses Microsoft 365.` : "This looks like a Microsoft account."} Those sign in with Microsoft instead of an app password.</span>
          <button type="button" className="btn sm" onClick={() => setProviderId("outlook")}>
            Use Microsoft sign-in
          </button>
        </div>
      )}
      {other && !reconnect && (
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="mail-host">IMAP server</label>
            <input id="mail-host" className="input" placeholder="imap.example.com" value={host} disabled={busy} onChange={(e) => setHost(e.target.value)} />
          </div>
          <div className="field" style={{ width: 110 }}>
            <label htmlFor="mail-port">Port</label>
            <input id="mail-port" className="input" type="number" value={port} disabled={busy} onChange={(e) => setPort(Number(e.target.value) || 993)} />
          </div>
        </div>
      )}
      <div className="field">
        <label htmlFor="mail-name">Name this inbox</label>
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="connect-swatches" role="group" aria-label="Colour">
            {MAIL_COLORS.map((c) => (
              <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={c === shownColor} onClick={() => setColor(c)} />
            ))}
          </span>
          <input
            id="mail-name"
            className="input compact"
            style={{ flex: 1, minWidth: 140 }}
            placeholder="Personal, School, Work…"
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {NICKNAMES.filter((n) => !accounts.some((a) => a.name === n && a.id !== reconnect?.id)).map((n) => (
            <button key={n} type="button" className="inbox-pill" aria-pressed={name === n} onClick={() => setName(n)}>
              {n}
            </button>
          ))}
        </div>
      </div>
      {!busy && (
        <div className="notice-box">
          <ShieldCheck size={16} color="var(--life)" aria-hidden="true" />
          <span>
            {outlook
              ? "Your Microsoft sign-in is kept in your system keychain, and your mail is read only on this device. There is no Kindred server."
              : "Kindred signs in directly from this computer. The app password is kept in your system keychain, and your mail is read only on this device. There is no Kindred server."}
          </span>
        </div>
      )}
      {busy && (
        <ol className="connect-steps" aria-live="polite">
          <li className={phase === "signing-in" ? "is-active" : "is-done"}>
            {phase === "signing-in" ? <RefreshCw size={14} className="spin" /> : <Check size={14} />}{" "}
            {outlook ? "Waiting for you to sign in with Microsoft in your browser" : `Signing in to ${fields.host}`}
          </li>
          <li className={phase === "reading" ? "is-active" : ""}>
            {phase === "reading" ? <RefreshCw size={14} className="spin" /> : <span className="step-dot" />} Reading the last 14 days of mail
          </li>
        </ol>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!isDesktop && <p className="hint">Email works in the desktop app. You're viewing the browser preview.</p>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost" onClick={onDone} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!ready || busy || !isDesktop} onClick={submit}>
          {busy ? <RefreshCw size={15} className="spin" /> : <Lock size={15} />}
          {busy ? "Connecting…" : outlook ? "Sign in with Microsoft" : reconnect ? "Reconnect" : "Connect securely"}
        </button>
      </div>
    </div>
  );
}

/** "today", "tomorrow", "Thursday", or "October 30" further out. */
function replyDay(key: string, todayKey: string): string {
  const diff = daysBetween(todayKey, key);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  return fromKey(key).toLocaleDateString(undefined, diff < 7 ? { weekday: "long" } : { month: "long", day: "numeric" });
}

function DraftModal({ message, suggestion, onClose }: { message: MailMessage; suggestion: MailSuggestion | null; onClose: () => void }) {
  const name = useStore((s) => s.name);
  const d = today();
  const [text, setText] = useState(() => draftReply(message, suggestion, name, (k) => replyDay(k, d)));
  const toast = useToast((s) => s.show);

  return (
    <Modal onClose={onClose} labelledBy="draft-title">
      <h2 id="draft-title">Reply to {message.fromName || message.fromAddress}</h2>
      <p className="muted small" style={{ margin: "0 0 14px" }}>
        Re: {message.subject}
      </p>
      <label htmlFor="draft" className="sr-only">
        Reply
      </label>
      <textarea id="draft" className="input" style={{ minHeight: 180 }} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              toast("Copied");
            } catch {
              /* clipboard unavailable */
            }
          }}
        >
          <Copy size={15} /> Copy
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            openExternal(mailtoLink(message, text));
            onClose();
          }}
        >
          Open in Mail <ExternalLink size={14} />
        </button>
      </div>
    </Modal>
  );
}
