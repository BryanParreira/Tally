import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarPlus,
  Check,
  Copy,
  ExternalLink,
  GraduationCap,
  Layers,
  Lock,
  Mail,
  PenLine,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Modal, Segmented, initials } from "../components/ui";
import { daysBetween, dueLabel, formatDuration, fromKey } from "../lib/date";
import { relativeTime, useToast } from "../lib/hooks";
import { PROVIDERS, draftReply, mailtoLink, type MailSuggestion } from "../lib/mail";
import { isDesktop, mailConnect, mailFetch, openExternal } from "../lib/native";
import { isTyping, reveal, useNav } from "../lib/nav";
import { tomorrowOf, today, useStore } from "../lib/store";
import { buildTriage, groupByDate, type TriageItem } from "../lib/triage";
import type { MailAccount, MailMessage } from "../lib/types";
import { findNoteTasks } from "../lib/notes";

function errorText(err: unknown): string {
  const raw = typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
  if (/auth|login|credential|password|invalid/i.test(raw)) return "Sign-in failed. Check the address and app password. Your regular password won't work for most providers.";
  if (/dns|resolve|connect|timed out|network/i.test(raw)) return "Couldn't reach the mail server. Check your internet connection and the server name.";
  return raw;
}

/** Everything in the inbox, split into what needs you and what can wait. */
export function useTriage() {
  const mail = useStore((s) => s.mail);
  const tasks = useStore((s) => s.tasks);
  const notes = useStore((s) => s.notes);
  const courses = useStore((s) => s.courses);
  const cards = useStore((s) => s.cards);
  const triageDone = useStore((s) => s.triageDone);
  return useMemo(() => buildTriage({ mail, tasks, notes, courses, cards, triageDone }, today()), [mail, tasks, notes, courses, cards, triageDone]);
}

const KIND_ICON = { email: Mail, carried: RotateCcw, note: BookOpen, cards: Layers, study: GraduationCap };

export function InboxView() {
  const account = useStore((s) => s.mail.account);
  const lastSync = useStore((s) => s.mail.lastSync);
  const setMessages = useStore((s) => s.setMessages);
  const target = useNav((s) => s.target);
  const { signal, noise } = useTriage();
  const [tab, setTab] = useState<"signal" | "noise">("signal");
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftFor, setDraftFor] = useState<{ message: MailMessage; suggestion: MailSuggestion | null } | null>(null);
  const actions = useInboxActions();
  const d = today();

  const list = tab === "signal" ? signal : noise;
  const groups = groupByDate(list, d);
  const current = list.find((i) => i.id === selected) ?? null;

  // Keep a sensible selection as items are cleared.
  useEffect(() => {
    if (selected && !list.some((i) => i.id === selected)) setSelected(list[0]?.id ?? null);
  }, [list, selected]);

  // Arriving from a task's "From email" link.
  useEffect(() => {
    if (target?.kind !== "email") return;
    const id = `mail:${target.id}`;
    const inNoise = noise.some((i) => i.id === id);
    setTab(inNoise ? "noise" : "signal");
    setSelected(id);
    setPreview(true);
    reveal(`row-${id}`);
  }, [target]);

  const sync = async () => {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      setMessages(await mailFetch(account));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  // Superhuman-style keys: j/k move, space previews, e done, a accept, r reply, enter opens.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (isTyping(ev) || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const nav = useNav.getState();
      if (nav.palette || nav.launcher || document.querySelector(".modal")) return;
      const i = list.findIndex((x) => x.id === selected);
      const item = list[i];
      const after = () => setSelected(list[i + 1]?.id ?? list[i - 1]?.id ?? null);
      if (["j", "k", "ArrowDown", "ArrowUp"].includes(ev.key)) {
        if (!list.length) return;
        ev.preventDefault();
        const down = ev.key === "j" || ev.key === "ArrowDown";
        const n = list[i < 0 ? 0 : Math.min(list.length - 1, Math.max(0, i + (down ? 1 : -1)))];
        setSelected(n.id);
        reveal(`row-${n.id}`);
      } else if (ev.key === " " && item) {
        ev.preventDefault();
        setPreview(!preview);
      } else if (ev.key === "e" && item) {
        actions.done(item);
        after();
      } else if (ev.key === "a" && item) {
        if (actions.accept(item)) after();
      } else if (ev.key === "r" && item?.message) {
        ev.preventDefault();
        setDraftFor({ message: item.message, suggestion: item.suggestion ?? null });
      } else if (ev.key === "Enter" && item) {
        actions.open(item);
      } else if (ev.key === "Tab") {
        ev.preventDefault();
        setTab(tab === "signal" ? "noise" : "signal");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="page inbox-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <Mail size={13} /> {account ? account.username : "Inbox"}
          </p>
          <h1 className="title">{signal.length ? `${signal.length} ${signal.length === 1 ? "thing needs" : "things need"} you` : "Inbox zero"}</h1>
          <p className="subtitle">
            Email, unfinished work, notes and study in one place{account ? ` · ${lastSync ? `synced ${relativeTime(lastSync)}` : "not synced yet"}` : ""}
          </p>
        </div>
        <div className="row">
          <Segmented
            label="Inbox view"
            value={tab}
            onChange={setTab}
            options={[
              { value: "signal", label: `Signal ${signal.length}` },
              { value: "noise", label: `Noise ${noise.length}` },
            ]}
          />
          {account ? (
            <button type="button" className="btn" onClick={sync} disabled={busy}>
              <RefreshCw size={15} className={busy ? "spin" : undefined} /> {busy ? "Syncing…" : "Sync"}
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => setConnecting(true)}>
              <Mail size={15} /> Connect email
            </button>
          )}
        </div>
      </header>
      {error && (
        <p className="error" role="alert" style={{ marginTop: -10, marginBottom: 16 }}>
          {error}
        </p>
      )}

      <div className={`inbox-split${preview && current ? " with-pane" : ""}`}>
        <div className="inbox-list" role="listbox" aria-label={tab === "signal" ? "Needs you" : "Can wait"}>
          {list.length === 0 && (
            <div className="empty">
              <span className="glyph">
                <Check size={20} aria-hidden="true" />
              </span>
              <h3>{tab === "signal" ? "Nothing needs you" : "No noise"}</h3>
              <p>
                {tab === "signal"
                  ? "Deadlines from email, unfinished work, tasks in your notes and due flashcards show up here."
                  : "Newsletters and mail that doesn't ask anything of you land here."}
              </p>
              {!account && tab === "signal" && (
                <button type="button" className="btn" style={{ marginTop: 18 }} onClick={() => setConnecting(true)}>
                  <Mail size={15} /> Connect email
                </button>
              )}
            </div>
          )}
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className="section inbox-group">{g.label}</h2>
              {g.items.map((item) => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <div
                    key={item.id}
                    id={`row-${item.id}`}
                    role="option"
                    aria-selected={item.id === selected}
                    className={`inbox-row${item.id === selected ? " is-selected" : ""}`}
                    onClick={() => {
                      setSelected(item.id);
                      setPreview(true);
                    }}
                    onDoubleClick={() => actions.open(item)}
                  >
                    <span className="avatar" aria-hidden="true">
                      {item.kind === "email" ? initials(item.from) : <Icon size={15} />}
                    </span>
                    <div className="inbox-row-body">
                      <div className="row" style={{ gap: 8 }}>
                        <span className="inbox-from truncate">{item.from}</span>
                        <span className="spacer" />
                        <span className="muted small nowrap">{item.kind === "email" ? relativeTime(item.time) : ""}</span>
                      </div>
                      <div className="inbox-title truncate">{item.title}</div>
                      <div className="inbox-detail truncate">{item.detail}</div>
                    </div>
                    <button
                      type="button"
                      className="icon-btn row-done"
                      aria-label="Mark done"
                      title="Done (E)"
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.done(item);
                      }}
                    >
                      <Check size={15} />
                    </button>
                  </div>
                );
              })}
            </section>
          ))}
          {list.length > 0 && (
            <p className="hint inbox-keys">
              <span className="kbd">J</span> <span className="kbd">K</span> move · <span className="kbd">Space</span> preview · <span className="kbd">E</span> done ·{" "}
              <span className="kbd">A</span> accept · <span className="kbd">Tab</span> signal/noise
            </p>
          )}
        </div>

        {preview && current && (
          <aside className="inbox-pane" aria-label="Preview">
            <Pane item={current} onDraft={(message, suggestion) => setDraftFor({ message, suggestion })} onClose={() => setPreview(false)} />
          </aside>
        )}
      </div>

      {connecting && (
        <Modal onClose={() => setConnecting(false)} labelledBy="connect-title">
          <ConnectForm onDone={() => setConnecting(false)} />
        </Modal>
      )}
      {draftFor && <DraftModal message={draftFor.message} suggestion={draftFor.suggestion} onClose={() => setDraftFor(null)} />}
    </div>
  );
}

/** What each kind of inbox item does when accepted, opened or cleared. */
function useInboxActions() {
  const toast = useToast((s) => s.show);
  return useMemo(
    () => ({
      done(item: TriageItem) {
        const s = useStore.getState();
        if (item.kind === "email" && item.message) s.handleMail(item.message.id);
        else s.markTriaged(item.id);
      },
      /** The item's main action. Returns true when the item leaves the inbox. */
      accept(item: TriageItem): boolean {
        const s = useStore.getState();
        switch (item.kind) {
          case "email":
            if (!item.suggestion) return false;
            s.addMailTask(item.suggestion);
            toast("Added to your plan");
            return true;
          case "carried":
            s.markTriaged(item.id);
            toast("Kept on today's plan");
            return true;
          case "note": {
            const n = s.planNoteTasks(item.noteId!);
            toast(n === 1 ? "Added to your plan" : `Planned ${n} tasks`);
            return true;
          }
          case "study": {
            const n = s.planStudyToday(item.courseId!);
            s.markTriaged(item.id);
            toast(n ? `Added ${n} study ${n === 1 ? "block" : "blocks"} to today` : "Today's study is already planned");
            return true;
          }
          case "cards":
            useNav.getState().go("study", { kind: "course", id: item.courseId! });
            return false;
        }
      },
      open(item: TriageItem) {
        const go = useNav.getState().go;
        if (item.kind === "carried") go("today", { kind: "task", id: item.taskId! });
        else if (item.kind === "note") go("notes", { kind: "note", id: item.noteId! });
        else if (item.kind === "cards" || item.kind === "study") go("study", { kind: "course", id: item.courseId! });
      },
    }),
    [toast],
  );
}

function Pane({ item, onDraft, onClose }: { item: TriageItem; onDraft: (m: MailMessage, s: MailSuggestion | null) => void; onClose: () => void }) {
  const actions = useInboxActions();
  const toast = useToast((s) => s.show);
  const d = today();
  const close = (
    <button type="button" className="icon-btn pane-close" aria-label="Close preview" onClick={onClose}>
      <X size={15} />
    </button>
  );

  if (item.kind === "email" && item.message) {
    const m = item.message;
    const s = item.suggestion;
    return (
      <article className="pane-body" key={item.id}>
        {close}
        <div className="row" style={{ gap: 12, marginBottom: 14 }}>
          <span className="avatar" aria-hidden="true">
            {initials(item.from)}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }} className="truncate">
              {m.fromName || m.fromAddress}
            </div>
            <div className="muted small truncate">
              {m.fromAddress} · {new Date(m.date).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
            </div>
          </div>
        </div>
        <h2 className="pane-title">{m.subject || "(no subject)"}</h2>
        {s && (
          <div className="suggest" style={{ margin: "14px 0 18px" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div className="what">{s.title}</div>
              <div className="why">
                {s.reason}
                {s.due ? ` · ${dueLabel(s.due, d).replace(/^Due/, "due")}` : ""} · about {formatDuration(s.duration)}
              </div>
            </div>
            <button type="button" className="btn primary sm" onClick={() => actions.accept(item)}>
              <Plus size={14} /> Add to plan
            </button>
          </div>
        )}
        <div className="pane-text">{m.text || "(This message has no text.)"}</div>
        <div className="row wrap pane-actions">
          <button type="button" className="btn" onClick={() => onDraft(m, s ?? null)}>
            <PenLine size={14} /> Draft reply
          </button>
          <button type="button" className="btn" onClick={() => actions.done(item)}>
            <Check size={14} /> Done
          </button>
        </div>
      </article>
    );
  }

  if (item.kind === "carried") {
    const task = useStore.getState().tasks.find((t) => t.id === item.taskId);
    return (
      <article className="pane-body" key={item.id}>
        {close}
        <p className="eyebrow">Carried over</p>
        <h2 className="pane-title">{item.title}</h2>
        <p className="pane-text" style={{ marginTop: 10 }}>
          {item.detail} {task ? `It takes about ${formatDuration(task.duration)}.` : ""}
        </p>
        <div className="row wrap pane-actions">
          <button type="button" className="btn primary" onClick={() => actions.accept(item)}>
            <Check size={14} /> Keep it today
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              useStore.getState().moveTasks([item.taskId!], tomorrowOf(d));
              useStore.getState().markTriaged(item.id);
              toast("Moved to tomorrow");
            }}
          >
            <ArrowRight size={14} /> Tomorrow
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              useStore.getState().deleteTask(item.taskId!);
              toast("Deleted");
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
        {close}
        <p className="eyebrow">From your note</p>
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
          <button type="button" className="btn primary" onClick={() => actions.accept(item)}>
            <CalendarPlus size={14} /> Plan {pending.length === 1 ? "it" : "them"}
          </button>
          <button type="button" className="btn" onClick={() => actions.open(item)}>
            <BookOpen size={14} /> Open note
          </button>
        </div>
      </article>
    );
  }

  const course = useStore.getState().courses.find((c) => c.id === item.courseId);
  return (
    <article className="pane-body" key={item.id}>
      {close}
      <p className="eyebrow">{course?.name ?? "Study"}</p>
      <h2 className="pane-title">{item.title}</h2>
      <p className="pane-text" style={{ marginTop: 10 }}>
        {item.detail}
        {course ? ` The exam is in ${daysBetween(d, course.examDate)} days, on ${fromKey(course.examDate).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}.` : ""}
      </p>
      <div className="row wrap pane-actions">
        <button type="button" className="btn primary" onClick={() => (item.kind === "cards" ? actions.open(item) : actions.accept(item))}>
          {item.kind === "cards" ? (
            <>
              <Layers size={14} /> Review now
            </>
          ) : (
            <>
              <CalendarPlus size={14} /> Plan today's study
            </>
          )}
        </button>
        <button type="button" className="btn" onClick={() => actions.done(item)}>
          Not today
        </button>
      </div>
    </article>
  );
}

function ConnectForm({ onDone }: { onDone: () => void }) {
  const [providerId, setProviderId] = useState("gmail");
  const provider = PROVIDERS.find((p) => p.id === providerId)!;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(993);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setMailAccount = useStore((s) => s.setMailAccount);
  const setMessages = useStore((s) => s.setMessages);
  const toast = useToast((s) => s.show);

  const other = providerId === "other";
  const ready = email.includes("@") && password.length > 0 && (!other || host.trim().length > 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const account: MailAccount = { provider: providerId, host: other ? host.trim() : provider.host, port: other ? port : provider.port, username: email.trim() };
    try {
      await mailConnect(account, password);
      setMailAccount(account);
      setPassword("");
      setMessages(await mailFetch(account));
      toast("Email connected");
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div>
        <h2 id="connect-title">Connect your email</h2>
        <p className="muted" style={{ margin: 0 }}>
          Kindred reads recent mail on this computer, sorts it into Signal and Noise, and turns deadlines and requests into tasks.
        </p>
      </div>
      <div className="field">
        <span className="label" id="provider-label">
          Email provider
        </span>
        <div className="providers" role="group" aria-labelledby="provider-label">
          {PROVIDERS.map((p) => (
            <button key={p.id} type="button" className="provider" aria-pressed={p.id === providerId} onClick={() => setProviderId(p.id)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="mail-address">Email address</label>
        <input id="mail-address" className="input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="mail-password">App password</label>
        <input
          id="mail-password"
          className="input"
          type="password"
          autoComplete="off"
          placeholder="xxxx xxxx xxxx xxxx"
          value={password}
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
      {other && (
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="mail-host">IMAP server</label>
            <input id="mail-host" className="input" placeholder="imap.example.com" value={host} onChange={(e) => setHost(e.target.value)} />
          </div>
          <div className="field" style={{ width: 110 }}>
            <label htmlFor="mail-port">Port</label>
            <input id="mail-port" className="input" type="number" value={port} onChange={(e) => setPort(Number(e.target.value) || 993)} />
          </div>
        </div>
      )}
      <div className="notice-box">
        <ShieldCheck size={16} color="var(--life)" aria-hidden="true" />
        <span>
          Kindred signs in directly from this computer. The app password is kept in your system keychain, and your mail is read only on this device. There is no Kindred server.
        </span>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!isDesktop && <p className="hint">Email works in the desktop app. You're viewing the browser preview.</p>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!ready || busy || !isDesktop} onClick={submit}>
          {busy ? <RefreshCw size={15} className="spin" /> : <Lock size={15} />}
          {busy ? "Connecting…" : "Connect securely"}
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
