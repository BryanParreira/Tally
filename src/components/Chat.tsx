import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, ChevronDown, Clock, ListPlus, RotateCcw, Square, Undo2, Wand2 } from "lucide-react";
import { ModelSetup } from "./Assistant";
import { ask, listItems, refreshAi, stopAsking, useAi } from "../lib/ai";
import { routeMessage, tidyPrompt } from "../lib/assistantContext";
import { dueLabel, formatDay, formatDuration, formatTime } from "../lib/date";
import { parseBrainDump } from "../lib/parse";
import { useChat, type ChatMessage } from "../lib/chat";
import { pop, spring } from "../lib/motion";
import { useNav, type View } from "../lib/nav";
import { today as todayKey, useStore } from "../lib/store";

const SUGGESTIONS = ["Plan my day", "What should I do first?", "What's due this week?", "Sum up my inbox"];
const EXAMPLES = [
  "finish history essay by friday, gym at 6pm, call mom",
  "study bio chapter 4 for 2h, reply to Sam, groceries",
  "team sync at 1:30 for 15 min, send the report by tomorrow",
  "read 20 pages, laundry, plan next week for 20 min",
];

/**
 * Ask Tally: the one box on Today. Say what you need to do and it plans it, or
 * ask about your day or inbox. Replies open upward as a card.
 */
export function Chat({ open, view }: { open: boolean; view: View }) {
  const messages = useChat((s) => s.messages);
  const { send, clear, undo, addSteps } = useChat.getState();
  const phase = useAi((s) => s.phase);
  const busy = useAi((s) => s.busy);
  const enabled = useStore((s) => s.settings.assistant);
  const ready = phase === "ready";
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const setChat = useNav.getState().setChat;
  const placeholder = useMemo(() => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)], []);
  const d = todayKey();
  // What pressing Enter would plan, shown before it happens.
  const preview = useMemo(() => {
    const route = text.trim() ? routeMessage(text, d, ready) : null;
    return route?.kind === "add" ? parseBrainDump(route.text, d) : [];
  }, [text, d, ready]);

  useEffect(() => {
    refreshAi();
  }, []);
  useEffect(() => {
    if (open) input.current?.focus();
    else input.current?.blur();
  }, [open]);
  // Click anywhere else to tuck the conversation away.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (dock.current && !dock.current.contains(e.target as Node)) setChat(false);
    };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  }, [open, setChat]);
  // Follow the conversation as it grows, but never fight a reader who scrolled up.
  const stick = useRef(true);
  const inner = useRef<HTMLDivElement>(null);
  const count = messages.length;
  useEffect(() => {
    stick.current = true;
    const el = scroll.current;
    if (el) requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }));
  }, [count, open]);
  useEffect(() => {
    const el = scroll.current;
    const body = inner.current;
    if (!el || !body) return;
    const follow = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    follow.observe(body);
    return () => follow.disconnect();
  }, [count > 0, open]);

  if (!enabled || view !== "today") return null;
  const showCard = open && messages.length > 0;

  /** Let the assistant clean up a long, messy dump; the user still reviews it before planning. */
  const tidy = async () => {
    try {
      const lines = listItems(await ask(tidyPrompt(text), { maxTokens: 300, temperature: 0 }));
      if (lines.length) setText(lines.join("; "));
    } catch {
      /* leave the text as it was */
    }
  };

  const submit = (value = text) => {
    if (!value.trim()) return;
    send(value);
    setText("");
    setChat(true);
  };

  return (
    <div
      className="dock"
      ref={dock}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        if (busy) stopAsking();
        else setChat(false);
      }}
    >
      <AnimatePresence>
        {showCard && (
          <motion.section
            key="card"
            className="dock-card glass"
            aria-label="Conversation with Tally"
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98, transition: { duration: 0.14 } }}
            transition={pop}
          >
            <div className="dock-head">
              <span>Tally</span>
              <span className="spacer" />
              <button type="button" className="icon-btn" aria-label="Start over" title="Start over" onClick={clear}>
                <RotateCcw size={14} />
              </button>
              <button type="button" className="icon-btn" aria-label="Hide conversation" title="Hide" onClick={() => setChat(false)}>
                <ChevronDown size={16} />
              </button>
            </div>
            <div
              className="dock-scroll"
              ref={scroll}
              onScroll={(e) => {
                const el = e.currentTarget;
                stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
              }}
            >
              <div className="dock-flow" ref={inner} aria-live="polite">
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <Bubble key={m.id} m={m} onUndo={() => undo(m.id)} onAddSteps={() => addSteps(m.id)} />
                ))}
              </AnimatePresence>
              </div>
            </div>
          </motion.section>
        )}
        {open && messages.length === 0 && (
          <motion.div key="chips" className="dock-chips" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6, transition: { duration: 0.1 } }} transition={spring}>
            {ready && SUGGESTIONS.map((c) => (
              <button key={c} type="button" className="chip glass" onClick={() => submit(c)}>
                {c}
              </button>
            ))}
          </motion.div>
        )}
        {preview.length > 0 && (
          <motion.div key="preview" className="dock-preview glass" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6, transition: { duration: 0.1 } }} transition={spring} aria-live="polite">
            {preview.map((p, i) => (
              <span className="preview-chip" key={i}>
                <span className={`dot ${p.category}`} aria-hidden="true" />
                <strong style={{ fontWeight: 600 }}>{p.title}</strong>
                <span className="meta row" style={{ gap: 4 }}>
                  <Clock size={12} aria-hidden="true" />
                  {p.start !== null ? formatTime(p.start) : formatDuration(p.duration)}
                </span>
                {p.date && p.date !== d && <span className="meta">{formatDay(p.date, d)}</span>}
                {p.due && <span className="meta">{dueLabel(p.due, d)}</span>}
              </span>
            ))}
            {ready && text.length > 50 && (
              <button type="button" className="btn ghost sm" disabled={busy} onClick={tidy}>
                <Wand2 size={13} /> {busy ? "Tidying…" : "Tidy"}
              </button>
            )}
            <span className="hint row" style={{ gap: 6, marginLeft: "auto" }}>
              <span className="kbd">Enter</span> to plan
            </span>
          </motion.div>
        )}
        {open && !ready && phase !== "unknown" && (
          <motion.div key="setup" className="dock-note glass" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
            <ModelSetup compact />
            <p className="muted small" style={{ margin: "8px 0 0" }}>
              Adding tasks works already. Questions need the assistant.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <form
        className="dock-bar glass"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Ask Tally
        </label>
        <input
          id="chat-input"
          ref={input}
          autoComplete="off"
          value={text}
          onFocus={() => setChat(true)}
          onChange={(e) => setText(e.target.value)}
          placeholder={messages.length ? "Ask a follow-up…" : `Add tasks or ask Tally, e.g. “${placeholder}”`}
        />
                {busy ? (
          <button type="button" className="btn primary dock-send" aria-label="Stop" onClick={() => stopAsking()}>
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          text.trim() && (
            <button type="submit" className="btn primary dock-send" aria-label="Send">
              <ArrowUp size={17} strokeWidth={2.4} />
            </button>
          )
        )}
      </form>
    </div>
  );
}

function Bubble({ m, onUndo, onAddSteps }: { m: ChatMessage; onUndo(): void; onAddSteps(): void }) {
  const motionProps = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: spring };
  if (m.role === "user")
    return (
      <motion.div className="bubble user" {...motionProps}>
        {m.text}
      </motion.div>
    );
  // Only plans can become tasks: feedback on your inbox is just feedback.
  const steps = m.offerTasks && !m.pending && !m.failed && !m.added ? listItems(m.text).length : 0;
  return (
    <motion.div className={`bubble tally${m.failed ? " failed" : ""}`} {...motionProps}>
      {m.text ? <Formatted text={m.text} /> : (
        <span className="typing" aria-label="Thinking">
          <i />
          <i />
          <i />
        </span>
      )}
      {(m.added || m.undoable || steps > 1) && (
        <div className="bubble-actions">
          {(m.added || m.undoable) && (
            <button type="button" className="btn ghost sm" onClick={onUndo}>
              <Undo2 size={13} /> Undo
            </button>
          )}
          {steps > 1 && (
            <button type="button" className="btn sm" onClick={onAddSteps}>
              <ListPlus size={13} /> Add {steps} as tasks
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

/** Replies are plain text with "- " lines; show them as paragraphs and tidy lists, with "Name: what" leads in bold. */
export function Formatted({ text }: { text: string }) {
  const blocks: ({ kind: "p"; text: string } | { kind: "ul"; items: string[] })[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const item = line.match(/^(?:[-•*]|\d+[.)])\s+(.+)$/)?.[1];
    const last = blocks.at(-1);
    if (item) {
      if (last?.kind === "ul") last.items.push(item);
      else blocks.push({ kind: "ul", items: [item] });
    } else blocks.push({ kind: "p", text: line });
  }
  return (
    <div className="fmt">
      {blocks.map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>{b.text}</p>
        ) : (
          <ul key={i}>
            {b.items.map((it, j) => {
              const lead = it.match(/^([^:]{2,40}):\s+(.+)$/);
              return <li key={j}>{lead ? (<><strong>{lead[1]}</strong> {lead[2]}</>) : it}</li>;
            })}
          </ul>
        ),
      )}
    </div>
  );
}
