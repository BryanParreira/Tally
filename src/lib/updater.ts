/**
 * Updates from GitHub Releases, signed with Kindred's key and verified before
 * installing. Checks quietly on launch and every few hours; nothing installs
 * until you say so.
 */
import { create } from "zustand";
import { isDesktop } from "./native";

type Status = "idle" | "checking" | "available" | "downloading" | "ready" | "latest" | "error";

interface UpdateState {
  status: Status;
  version: string | null;
  notes: string | null;
  progress: number;
  error: string | null;
}

export const useUpdate = create<UpdateState>(() => ({ status: "idle", version: null, notes: null, progress: 0, error: null }));

type Update = Awaited<ReturnType<typeof import("@tauri-apps/plugin-updater").check>>;
let pending: Update = null;

/** Look for a newer version. `quiet` keeps "you're up to date" and errors out of the way. */
export async function checkForUpdate(quiet = false): Promise<void> {
  if (!isDesktop) {
    if (!quiet) useUpdate.setState({ status: "latest" });
    return;
  }
  const s = useUpdate.getState();
  if (s.status === "checking" || s.status === "downloading" || s.status === "ready") return;
  useUpdate.setState({ status: "checking", error: null });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    pending = await check();
    if (pending) useUpdate.setState({ status: "available", version: pending.version, notes: pending.body ?? null });
    else useUpdate.setState({ status: quiet ? "idle" : "latest" });
  } catch (err) {
    useUpdate.setState({ status: quiet ? "idle" : "error", error: String(err) });
  }
}

/** Download and install the update, then restart into the new version. */
export async function installUpdate(): Promise<void> {
  if (!pending) return;
  let total = 0;
  let got = 0;
  useUpdate.setState({ status: "downloading", progress: 0 });
  try {
    await pending.downloadAndInstall((e) => {
      if (e.event === "Started") total = e.data.contentLength ?? 0;
      else if (e.event === "Progress") {
        got += e.data.chunkLength;
        useUpdate.setState({ progress: total ? got / total : 0 });
      } else if (e.event === "Finished") useUpdate.setState({ status: "ready", progress: 1 });
    });
    useUpdate.setState({ status: "ready" });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (err) {
    useUpdate.setState({ status: "error", error: String(err) });
  }
}

/** The running version, from the app bundle. */
export async function appVersion(): Promise<string> {
  if (!isDesktop) return import.meta.env.PACKAGE_VERSION ?? "dev";
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}
