import { Component, type ErrorInfo, type ReactNode } from "react";
import { exportData } from "../lib/store";
import { saveBackup } from "../lib/native";

/**
 * If something in the interface breaks, show a calm way out instead of a blank
 * window. The user's data is separate from the screen, so it's safe: they can
 * save a copy and reload.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; saved: string | null }> {
  state = { error: null as Error | null, saved: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Tally crashed", error, info.componentStack);
  }

  backup = async () => {
    try {
      this.setState({ saved: (await saveBackup(exportData())) ?? "your downloads" });
    } catch {
      this.setState({ saved: null });
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h1>Something went wrong</h1>
        <p>Your tasks, notes and settings are safe on this computer. Reloading usually fixes it.</p>
        <div className="row" style={{ justifyContent: "center", gap: 10 }}>
          <button type="button" className="btn primary" onClick={() => location.reload()}>
            Reload Tally
          </button>
          <button type="button" className="btn" onClick={this.backup}>
            Save a backup first
          </button>
        </div>
        {this.state.saved && <p className="muted small">Backup saved{this.state.saved !== "your downloads" ? ` to ${this.state.saved}` : " to your downloads"}.</p>}
        <details>
          <summary>Details</summary>
          <pre>{String(this.state.error.stack ?? this.state.error.message)}</pre>
        </details>
      </div>
    );
  }
}
