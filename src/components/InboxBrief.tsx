import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Inbox, Sun } from "lucide-react";
import { dueLabel } from "../lib/date";
import { relativeTime } from "../lib/hooks";
import { spring } from "../lib/motion";
import { useNav } from "../lib/nav";
import { today, useStore } from "../lib/store";
import { useInboxActions, useTriage } from "../views/InboxView";
import { Avatar } from "./ui";

const SHOWN = 4;
const KINDS = [
  { bucket: "reply", label: "Reply" },
  { bucket: "deadline", label: "Deadlines" },
  { bucket: "todo", label: "To do" },
] as const;

/**
 * The inbox at a glance, beside Today: what needs you by kind, and the most
 * pressing few with one-click Today or Done.
 */
export function InboxOverview() {
  const { signal } = useTriage();
  const actions = useInboxActions();
  const go = useNav((s) => s.go);
  const lastSync = useStore((s) => s.mail.lastSync);
  const connected = useStore((s) => s.mail.accounts.length > 0);
  const d = today();
  const top = [...signal].sort((a, b) => rank(a.bucket) - rank(b.bucket) || b.time - a.time).slice(0, SHOWN);

  return (
    <section className="side-card" aria-label="Inbox">
      <header className="side-head">
        <Inbox size={14} aria-hidden="true" />
        <span className="side-title">Inbox</span>
        <span className="side-meta">{lastSync ? `synced ${relativeTime(lastSync)}` : connected ? "not synced yet" : ""}</span>
        <span className="spacer" />
        <button type="button" className="icon-btn" title="Open Inbox" aria-label="Open Inbox" onClick={() => go("inbox")}>
          <ArrowRight size={14} />
        </button>
      </header>
      <div className="ib-tiles">
        {KINDS.map((k) => {
          const n = signal.filter((i) => i.bucket === k.bucket).length;
          return (
            <button key={k.bucket} type="button" className={`ib-tile${n ? "" : " is-zero"}${k.bucket === "deadline" && n ? " is-urgent" : ""}`} onClick={() => go("inbox")}>
              <span className="ib-tile-n">{n}</span>
              <span className="ib-tile-k">{k.label}</span>
            </button>
          );
        })}
      </div>
      {top.length === 0 ? (
        <p className="side-empty">{connected ? "You're all caught up." : "Connect your email to see what needs you here."}</p>
      ) : (
        <AnimatePresence initial={false} mode="popLayout">
          {top.map((item) => (
            <motion.div key={item.id} className="ib-item" layout="position" exit={{ opacity: 0, x: 16, transition: { duration: 0.14 } }} transition={spring}>
              <Avatar name={item.from} size={28} />
              <button type="button" className="ib-item-text" onClick={() => go("inbox", item.message ? { kind: "email", id: item.message.id } : undefined)}>
                <span className="ib-item-top">
                  <span className="ib-item-from truncate">{item.from}</span>
                  {item.bucket === "deadline" && item.suggestion?.due && <span className="ib-due">{dueLabel(item.suggestion.due, d)}</span>}
                </span>
                <span className="ib-item-subject truncate">{item.title}</span>
              </button>
              <span className="ib-actions">
                <button type="button" className="icon-btn" title="Add to today" aria-label="Add to today" onClick={() => actions.today(item)}>
                  <Sun size={14} />
                </button>
                <button type="button" className="icon-btn" title="Done" aria-label="Done" onClick={() => actions.done(item)}>
                  <Check size={14} />
                </button>
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
      {signal.length > SHOWN && (
        <button type="button" className="side-more" onClick={() => go("inbox")}>
          See all {signal.length}
        </button>
      )}
    </section>
  );
}

function rank(b: string): number {
  return b === "deadline" ? 0 : b === "reply" ? 1 : 2;
}
