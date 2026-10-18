import { Download } from "lucide-react";
import { cancelDownload, downloadModel, installAssistant, useAi } from "../lib/ai";

const gb = (bytes: number) => (bytes / 1e9).toFixed(1);

/** "about 4 min left" */
export function timeLeft(seconds: number): string {
  if (seconds < 45) return "less than a minute left";
  const m = Math.round(seconds / 60);
  return m < 60 ? `about ${m} min left` : `about ${Math.round(m / 6) / 10} h left`;
}

/** A quiet line for first launch: the assistant is on its way, and you can carry on. */
export function AssistantProgress() {
  const phase = useAi((s) => s.phase);
  const progress = useAi((s) => s.progress);
  const eta = useAi((s) => s.eta);
  if (phase !== "downloading" && phase !== "ready") return null;
  return (
    <div className="ai-progress" aria-live="polite">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="small">{phase === "ready" ? "Your assistant is ready." : "Getting your assistant ready in the background…"}</span>
        {phase === "downloading" && <span className="small muted">{Math.round(progress * 100)}%{eta ? ` · ${timeLeft(eta)}` : ""}</span>}
      </div>
      <div className="ai-bar" role="progressbar" aria-valuenow={Math.round((phase === "ready" ? 1 : progress) * 100)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${(phase === "ready" ? 1 : progress) * 100}%` }} />
      </div>
    </div>
  );
}

/** Shown wherever the assistant is wanted but its model isn't on disk yet. */
export function ModelSetup({ compact = false }: { compact?: boolean }) {
  const phase = useAi((s) => s.phase);
  const progress = useAi((s) => s.progress);
  const bytes = useAi((s) => s.bytes);
  const error = useAi((s) => s.error);
  const name = useAi((s) => s.name);
  const eta = useAi((s) => s.eta);
  const retryIn = useAi((s) => s.retryIn);
  if (phase === "ready" || phase === "unknown") return null;
  if (phase === "unavailable") return <p className="muted small">The assistant works in the Tally desktop app.</p>;
  return (
    <div className="ai-setup">
      {phase === "downloading" ? (
        <>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="small">
              Getting the assistant… {Math.round(progress * 100)}%{eta ? ` · ${timeLeft(eta)}` : ""}
            </span>
            <button type="button" className="btn ghost sm" onClick={() => cancelDownload()}>
              Pause
            </button>
          </div>
          <div className="ai-bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
          {!compact && <p className="muted small">One time only. It keeps going if you close this, and picks up where it left off.</p>}
        </>
      ) : (
        <>
          {!compact && (
            <p className="small" style={{ margin: 0 }}>
              Tally's assistant runs fully on your computer. It needs its model ({name}, {gb(bytes || 2.84e9)} GB) once.
            </p>
          )}
          {error && (
            <p className="small" style={{ color: "var(--danger)", margin: 0 }}>
              {error}
              {retryIn ? ` Trying again in ${retryIn}s.` : ""}
            </p>
          )}
          <button type="button" className="btn primary sm" onClick={() => (downloadModel(), installAssistant())}>
            <Download size={14} /> {error ? "Try again now" : "Get the assistant"}
          </button>
        </>
      )}
    </div>
  );
}
