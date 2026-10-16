import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Logo } from "../components/ui";
import { useStore } from "../lib/store";
import { TimeSelect } from "./SettingsView";

export function Onboarding() {
  const finish = useStore((s) => s.finishOnboarding);
  const [name, setName] = useState("");
  const [start, setStart] = useState(8 * 60);
  const [end, setEnd] = useState(22 * 60);
  const [example, setExample] = useState(true);

  return (
    <div className="onboard">
      <div className="card onboard-card">
        <Logo size={40} />
        <h1>Your day, planned for you.</h1>
        <p className="lede">
          Tell Kindred what's on your mind. It builds a realistic plan, keeps it on track as your day changes, and helps you focus.
        </p>

        <div className="stack" style={{ gap: 18 }}>
          <div className="field">
            <label htmlFor="ob-name">What should we call you?</label>
            <input
              id="ob-name"
              className="input"
              autoFocus
              placeholder="Your first name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && finish(name, start, end, example)}
            />
          </div>
          <div className="field">
            <span className="label">Your day usually runs</span>
            <div className="row">
              <TimeSelect label="Day starts" value={start} onChange={(v) => setStart(Math.min(v, end - 60))} />
              <span className="muted">to</span>
              <TimeSelect label="Day ends" value={end} onChange={(v) => setEnd(Math.max(v, start + 60))} />
            </div>
          </div>
          <label className="row" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={example} onChange={(e) => setExample(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--brand)" }} />
            <span>Start with an example day so I can see how it works</span>
          </label>
          <button type="button" className="btn primary lg" onClick={() => finish(name, start, end, example)}>
            Get started <ArrowRight size={16} />
          </button>
          <div className="notice-box">
            <ShieldCheck size={16} color="var(--life)" aria-hidden="true" />
            <span>No account and no cloud. Everything you add stays on this computer.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
