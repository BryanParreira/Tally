import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, Lock, Mail, PenLine, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Modal, initials } from "../components/ui";
import { daysBetween, dueLabel, fromKey, formatDuration } from "../lib/date";
import { relativeTime, useToast } from "../lib/hooks";
import { PROVIDERS, draftReply, mailtoLink, type MailSuggestion } from "../lib/mail";
import { useMailItems, type MailItem } from "../lib/mailSuggestions";
import { isDesktop, mailConnect, mailFetch, openExternal } from "../lib/native";
import { today, useStore } from "../lib/store";
import { isTyping, reveal, useNav } from "../lib/nav";
import type { MailAccount, MailMessage } from "../lib/types";

export function InboxView() {
  const account = useStore((s) => s.mail.account);
  return <div className="page">{account ? <Connected account={account} /> : <Connect />}</div>;
}

function errorText(err: unknown): string {
  const raw = typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
  if (/auth|login|credential|password|invalid/i.test(raw)) return "Sign-in failed. Check the address and app password. Your regular password won't work for most providers.";
  if (/dns|resolve|connect|timed out|network/i.test(raw)) return "Couldn't reach the mail server. Check your internet connection and the server name.";
  return raw;
}

function Connect() {
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
      const messages = await mailFetch(account);
      setMessages(messages);
      toast("Email connected");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">Inbox</p>
          <h1 className="title">Let your inbox plan itself</h1>
          <p className="subtitle">Kindred reads your recent emails on this computer, finds deadlines and requests, and turns them into tasks.</p>
        </div>
      </header>

      <div className="card" style={{ padding: 26, maxWidth: 640 }}>
        <div className="stack" style={{ gap: 18 }}>
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
              Most providers need a special app password for this, not your normal password.{" "}
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
              Kindred signs in directly from this computer. Your app password is kept in your system's secure keychain (Keychain on Mac, Credential Manager on Windows),
              and your emails are read only on this device. There is no Kindred server.
            </span>
          </div>
          <p className="hint">Using Outlook.com or Microsoft 365? Those need Microsoft sign-in, which is coming soon.</p>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {!isDesktop && <p className="hint">Email works in the desktop app. You're viewing the browser preview.</p>}

          <div className="row">
            <button type="button" className="btn primary lg" disabled={!ready || busy || !isDesktop} onClick={submit}>
              {busy ? <RefreshCw size={16} className="spin" /> : <Lock size={16} />}
              {busy ? "Connecting…" : "Connect securely"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Connected({ account }: { account: MailAccount }) {
  const { needsYou, rest } = useMailItems();
  const lastSync = useStore((s) => s.mail.lastSync);
  const setMessages = useStore((s) => s.setMessages);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRest, setShowRest] = useState(false);
  const [draftFor, setDraftFor] = useState<MailItem | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const target = useNav((s) => s.target);
  const addMailTask = useStore((s) => s.addMailTask);
  const handleMail = useStore((s) => s.handleMail);
  const toast = useToast((s) => s.show);

  // Opened from a task or the command menu: show that email.
  useEffect(() => {
    if (target?.kind !== "email") return;
    if (rest.some((r) => r.message.id === target.id)) setShowRest(true);
    setSelected(target.id);
    reveal(`mail-${target.id}`);
  }, [target]);

  // j/k to move, a to add to plan, e to set aside, r to draft a reply.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (isTyping(ev) || ev.metaKey || ev.ctrlKey || ev.altKey || useNav.getState().palette || document.querySelector(".modal")) return;
      const i = needsYou.findIndex((x) => x.message.id === selected);
      const item = needsYou[i];
      if (ev.key === "j" || ev.key === "k" || ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        if (!needsYou.length) return;
        ev.preventDefault();
        const down = ev.key === "j" || ev.key === "ArrowDown";
        const n = needsYou[i < 0 ? 0 : Math.min(needsYou.length - 1, Math.max(0, i + (down ? 1 : -1)))];
        setSelected(n.message.id);
        reveal(`mail-${n.message.id}`);
      } else if (item && ev.key === "a" && item.suggestion) {
        addMailTask(item.suggestion);
        toast("Added to your plan");
        setSelected(needsYou[i + 1]?.message.id ?? needsYou[i - 1]?.message.id ?? null);
      } else if (item && ev.key === "e") {
        handleMail(item.message.id);
        setSelected(needsYou[i + 1]?.message.id ?? needsYou[i - 1]?.message.id ?? null);
      } else if (item && ev.key === "r") {
        ev.preventDefault();
        setDraftFor(item);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const sync = async () => {
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

  return (
    <>
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <Mail size={14} /> {account.username}
          </p>
          <h1 className="title">{needsYou.length ? `${needsYou.length} ${needsYou.length === 1 ? "email needs" : "emails need"} you` : "You're all caught up"}</h1>
          <p className="subtitle">
            Signal first, noise set aside · {lastSync ? `synced ${relativeTime(lastSync)}` : "not synced yet"}
          </p>
        </div>
        <button type="button" className="btn" onClick={sync} disabled={busy}>
          <RefreshCw size={15} className={busy ? "spin" : undefined} /> {busy ? "Syncing…" : "Sync"}
        </button>
      </header>
      {error && (
        <p className="error" role="alert" style={{ marginTop: -10, marginBottom: 16 }}>
          {error}
        </p>
      )}

      <h2 className="section">Signal · needs you</h2>
      <div>
        {needsYou.map((item, i) => (
          <MailCard
            key={item.message.id}
            item={item}
            delay={i * 40}
            selected={item.message.id === selected}
            onSelect={() => setSelected(item.message.id)}
            onDraft={() => setDraftFor(item)}
          />
        ))}
        {needsYou.length === 0 && (
          <div className="empty">
            <span className="glyph">
              <Check size={20} aria-hidden="true" />
            </span>
            <h3>Nothing needs you</h3>
            <p>When an email asks for something or mentions a deadline, it shows up here, ready to drop into your plan.</p>
          </div>
        )}
      </div>

      {rest.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <button type="button" className="btn ghost" onClick={() => setShowRest(!showRest)} aria-expanded={showRest}>
            <ChevronDown size={15} style={{ transform: showRest ? "rotate(180deg)" : undefined, transition: "transform .2s" }} />
            Noise · {rest.length} {rest.length === 1 ? "email" : "emails"} that can wait
          </button>
          {showRest && (
            <div className="card" style={{ marginTop: 10, padding: "4px 18px" }}>
              <div className="list">
                {rest.map(({ message }) => (
                  <div className={`list-item${message.id === selected ? " flash-highlight" : ""}`} key={message.id} id={`mail-${message.id}`}>
                    <span className="avatar" style={{ width: 28, height: 28, fontSize: 11 }} aria-hidden="true">
                      {initials(message.fromName || message.fromAddress)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="truncate" style={{ fontWeight: 550 }}>
                        {message.subject || "(no subject)"}
                      </div>
                      <div className="muted small truncate">{message.fromName || message.fromAddress}</div>
                    </div>
                    <span className="muted small">{relativeTime(message.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {draftFor && <DraftModal item={draftFor} onClose={() => setDraftFor(null)} />}
    </>
  );
}

function MailCard({ item, delay, onDraft, selected, onSelect }: { item: MailItem; delay: number; onDraft: () => void; selected: boolean; onSelect: () => void }) {
  const { message, suggestion } = item;
  const s = suggestion as MailSuggestion;
  const addMailTask = useStore((st) => st.addMailTask);
  const handleMail = useStore((st) => st.handleMail);
  const toast = useToast((st) => st.show);
  const d = today();

  return (
    <article id={`mail-${message.id}`} className={`mail-card${selected ? " is-selected" : ""}`} style={{ animationDelay: `${delay}ms` }} onMouseDown={onSelect}>
      <span className="avatar" aria-hidden="true">
        {initials(message.fromName || message.fromAddress)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <span style={{ fontWeight: 600 }} className="truncate">
            {message.fromName || message.fromAddress}
          </span>
          <span className="muted small">{relativeTime(message.date)}</span>
        </div>
        <div className="subject truncate">{message.subject || "(no subject)"}</div>
        <div className="snippet">{message.text.replace(/\s+/g, " ").slice(0, 220)}</div>

        <div className="suggest">
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="what">{s.title}</div>
            <div className="why">
              {s.reason}
              {s.due ? ` · ${dueLabel(s.due, d).replace(/^Due/, "due")}` : ""} · about {formatDuration(s.duration)}
            </div>
          </div>
          <button
            type="button"
            className="btn primary sm"
            onClick={() => {
              addMailTask(s);
              toast("Added to your plan");
            }}
          >
            <Plus size={14} /> Add to plan
          </button>
          <button type="button" className="btn sm" onClick={onDraft}>
            <PenLine size={14} /> Draft reply
          </button>
          <button type="button" className="icon-btn" aria-label="Dismiss" title="Dismiss" onClick={() => handleMail(message.id)}>
            <X size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}

/** "today", "tomorrow", "Thursday", or "October 30" further out. */
function replyDay(key: string, today: string): string {
  const diff = daysBetween(today, key);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  return fromKey(key).toLocaleDateString(undefined, diff < 7 ? { weekday: "long" } : { month: "long", day: "numeric" });
}

function DraftModal({ item, onClose }: { item: MailItem; onClose: () => void }) {
  const name = useStore((s) => s.name);
  const d = today();
  const [text, setText] = useState(() => draftReply(item.message, item.suggestion, name, (k) => replyDay(k, d)));
  const toast = useToast((s) => s.show);
  const msg: MailMessage = item.message;

  return (
    <Modal onClose={onClose} labelledBy="draft-title">
      <h2 id="draft-title">Reply to {msg.fromName || msg.fromAddress}</h2>
      <p className="muted small" style={{ margin: "0 0 14px" }}>
        Re: {msg.subject}
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
            openExternal(mailtoLink(msg, text));
            onClose();
          }}
        >
          Open in Mail <ExternalLink size={14} />
        </button>
      </div>
    </Modal>
  );
}
