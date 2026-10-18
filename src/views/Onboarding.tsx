import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Mail, ShieldCheck } from "lucide-react";
import { AssistantProgress } from "../components/Assistant";
import { CheckButton, Logo, Modal, Toast } from "../components/ui";
import { dueLabel } from "../lib/date";
import { useToast } from "../lib/hooks";
import { firstPlanDay } from "../lib/mail";
import { useMailItems } from "../lib/mailSuggestions";
import { today, useStore } from "../lib/store";
import { ConnectForm } from "./InboxView";
import { CalDavForm, TimeSelect } from "./SettingsView";

type Step = 0 | 1 | 2;
const STEPS = ["You", "Connect", "Your plan"];

/**
 * First run, in three short steps: who you are, bring in your email and calendar
 * (both optional), then a first plan built from what Tally found.
 */
export function Onboarding() {
  const finish = useStore((s) => s.finishOnboarding);
  const accounts = useStore((s) => s.mail.accounts);
  const messages = useStore((s) => s.mail.messages);
  const calendars = useStore((s) => s.calendars);
  const toast = useToast((s) => s.show);
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("");
  const [start, setStart] = useState(8 * 60);
  const [end, setEnd] = useState(22 * 60);
  const [modal, setModal] = useState<null | "mail" | "calendar">(null);
  const [calError, setCalError] = useState<string | null>(null);
  const [example, setExample] = useState(true);
  const { needsYou } = useMailItems();
  const d = today();

  // What Tally found in the inbox, best first: deadlines, then people waiting on you.
  const found = useMemo(
    () =>
      needsYou
        .filter((i) => i.suggestion!.kind !== "event" || i.suggestion!.due)
        .sort((a, b) => Number(!!b.suggestion!.due) - Number(!!a.suggestion!.due) || (a.suggestion!.due ?? "9").localeCompare(b.suggestion!.due ?? "9"))
        .slice(0, 8),
    [needsYou],
  );
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const chosen = found.filter((i) => !skipped.has(i.message.id));
  const connected = accounts.length > 0 || calendars.length > 0;

  // A newly connected calendar closes its own window.
  const calCount = useRef(calendars.length);
  useEffect(() => {
    if (modal === "calendar" && calendars.length > calCount.current) setModal(null);
    if (modal !== "calendar") calCount.current = calendars.length;
  }, [calendars.length, modal]);

  const done = () => {
    finish(name, start, end, !connected && example);
    const s = useStore.getState();
    chosen.forEach(({ message, suggestion }) => {
      s.planMail(message, firstPlanDay(suggestion!.due, d));
    });
    if (chosen.length) toast(`Your first plan is ready: ${chosen.length} ${chosen.length === 1 ? "thing" : "things"} from your inbox`);
  };

  return (
    <div className="onboard">
      <div className="card onboard-card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <Logo size={36} />
          <ol className="ob-steps" aria-label="Setup progress">
            {STEPS.map((s, i) => (
              <li key={s} aria-current={i === step ? "step" : undefined} className={i < step ? "is-done" : i === step ? "is-now" : ""}>
                {i < step ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : i + 1}
                <span className="sr-only">{s}</span>
              </li>
            ))}
          </ol>
        </div>

        {step === 0 && (
          <>
            <h1>Your day, planned for you.</h1>
            <p className="lede">Tally reads your inbox and calendar, builds a realistic plan, and keeps it on track. All of it stays on this computer.</p>
            <div className="stack" style={{ gap: 18 }}>
              <div className="field">
                <label htmlFor="ob-name">What should we call you?</label>
                <input id="ob-name" className="input" autoFocus placeholder="Your first name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setStep(1)} />
              </div>
              <div className="field">
                <span className="label">Your day usually runs</span>
                <div className="row">
                  <TimeSelect label="Day starts" value={start} onChange={(v) => setStart(Math.min(v, end - 60))} />
                  <span className="muted">to</span>
                  <TimeSelect label="Day ends" value={end} onChange={(v) => setEnd(Math.max(v, start + 60))} />
                </div>
              </div>
              <button type="button" className="btn primary lg" onClick={() => setStep(1)}>
                Continue <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1>Bring in your world</h1>
            <p className="lede">Connect what you already use and Tally plans around it. You can do this later in Settings.</p>
            <div className="stack" style={{ gap: 10 }}>
              <button type="button" className={`ob-connect${accounts.length ? " is-on" : ""}`} onClick={() => setModal("mail")}>
                <Mail size={18} aria-hidden="true" />
                <span className="ob-connect-text">
                  <strong>Email</strong>
                  <span>{accounts.length ? `${accounts[0].username}${accounts.length > 1 ? ` and ${accounts.length - 1} more` : ""} · ${messages.length} emails read` : "Gmail, Outlook, iCloud, school or work. Read here, never uploaded."}</span>
                </span>
                {accounts.length ? <Check size={16} color="var(--life)" aria-label="Connected" /> : <span className="btn sm">Connect</span>}
              </button>
              <button type="button" className={`ob-connect${calendars.length ? " is-on" : ""}`} onClick={() => setModal("calendar")}>
                <CalendarDays size={18} aria-hidden="true" />
                <span className="ob-connect-text">
                  <strong>Calendar</strong>
                  <span>{calendars.length ? `${calendars.length} ${calendars.length === 1 ? "calendar" : "calendars"} connected` : "iCloud, Google, Outlook or any calendar. Tally never plans over your events."}</span>
                </span>
                {calendars.length ? <Check size={16} color="var(--life)" aria-label="Connected" /> : <span className="btn sm">Connect</span>}
              </button>
            </div>
            <AssistantProgress />
            <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
              <button type="button" className="btn ghost" onClick={() => setStep(0)}>
                <ArrowLeft size={15} /> Back
              </button>
              <button type="button" className="btn primary" onClick={() => setStep(2)}>
                {connected ? "Continue" : "Skip for now"} <ArrowRight size={15} />
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>{found.length ? "Here's what I found" : "You're all set"}</h1>
            <p className="lede">
              {found.length
                ? "These need you. Untick anything you don't want, and Tally will put the rest into your plan."
                : accounts.length
                  ? "Nothing in your inbox needs you right now. Your plan will fill itself as mail arrives."
                  : "Add things as you think of them, in the bar at the bottom of Today."}
            </p>
            {found.length > 0 && (
              <div className="ob-found">
                {found.map(({ message, suggestion }) => (
                  <div key={message.id} className="ob-found-row" onClick={() => setSkipped((p) => (p.has(message.id) ? new Set([...p].filter((x) => x !== message.id)) : new Set(p).add(message.id)))}>
                    <CheckButton checked={!skipped.has(message.id)} onToggle={() => undefined} label={`Plan "${suggestion!.title}"`} />
                    <span className="ob-found-text">
                      <span className="truncate">{suggestion!.title}</span>
                      <span className="muted small truncate">{suggestion!.reason}</span>
                    </span>
                    {suggestion!.due && <span className="muted small nowrap">{dueLabel(suggestion!.due, d)}</span>}
                  </div>
                ))}
              </div>
            )}
            {!connected && (
              <label className="row" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={example} onChange={(e) => setExample(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--brand)" }} />
                <span>Start with an example day so I can see how it works</span>
              </label>
            )}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <button type="button" className="btn ghost" onClick={() => setStep(1)}>
                <ArrowLeft size={15} /> Back
              </button>
              <button type="button" className="btn primary lg" onClick={done}>
                {chosen.length ? `Plan my day (${chosen.length})` : "Start using Tally"} <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}

        <div className="notice-box">
          <ShieldCheck size={16} color="var(--life)" aria-hidden="true" />
          <span>No account and no cloud. Everything you add stays on this computer.</span>
        </div>
      </div>

      <Toast />
      {modal === "mail" && (
        <Modal onClose={() => setModal(null)} labelledBy="connect-title">
          <ConnectForm onDone={() => setModal(null)} />
        </Modal>
      )}
      {modal === "calendar" && (
        <Modal onClose={() => setModal(null)} labelledBy="cal-title">
          <h2 id="cal-title">Connect your calendar</h2>
          <CalDavForm onError={setCalError} />
          {calError && (
            <p className="error" role="alert">
              {calError}
            </p>
          )}
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <button type="button" className="btn ghost" onClick={() => setModal(null)}>
              {calendars.length ? "Done" : "Cancel"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
