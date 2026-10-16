/**
 * Thin bridge to the Rust side. When the UI runs in a plain browser
 * (`npm run dev`), everything falls back to localStorage so the interface can
 * be developed and tested without the desktop shell.
 */
import type { MailAccount, MailMessage } from "./types";

export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);

const STORAGE_KEY = "kindred:data";
export const STATE_EVENT = "kindred://state";
export const CAPTURE_EVENT = "kindred://quick-capture";
export const NOTICE_EVENT = "kindred://notice";

/** A reminder card shown in the corner of the screen, over any app. */
export interface Notice {
  id: string;
  kind: "up-next" | "focus-done";
  title: string;
  body: string;
  taskId: string;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(cmd, args);
}

export function windowLabel(): string {
  const cls = document.documentElement.classList;
  return cls.contains("nowbar-window") ? "nowbar" : cls.contains("notice-window") ? "notice" : "main";
}

export async function loadData(): Promise<string | null> {
  if (isDesktop) return invoke<string | null>("load_state");
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function saveData(json: string): Promise<void> {
  if (isDesktop) return invoke("save_state", { data: json, origin: windowLabel() });
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    /* storage unavailable: keep working in memory */
  }
}

/** Calls back with fresh data whenever another window saves. */
export async function onRemoteData(cb: (json: string) => void): Promise<() => void> {
  if (isDesktop) {
    const { listen } = await import("@tauri-apps/api/event");
    const me = windowLabel();
    return listen<{ origin: string; data: string }>(STATE_EVENT, (e) => {
      if (e.payload.origin !== me) cb(e.payload.data);
    });
  }
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) cb(e.newValue);
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export async function onQuickCapture(cb: () => void): Promise<() => void> {
  if (!isDesktop) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen(CAPTURE_EVENT, cb);
}

export async function dataLocation(): Promise<string> {
  if (!isDesktop) return "Browser storage (development mode)";
  return invoke<string>("data_location");
}

export async function setNowBarVisible(visible: boolean): Promise<void> {
  if (isDesktop) await invoke("set_nowbar_visible", { visible });
}

export async function showMainWindow(): Promise<void> {
  if (isDesktop) await invoke("show_main");
}

export async function openExternal(url: string): Promise<void> {
  if (isDesktop) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

/** Show Kindred's own notification card. Returns false outside the desktop app. */
export async function showNotice(notice: Notice): Promise<boolean> {
  if (!isDesktop) return false;
  await invoke("show_notice", { notice });
  return true;
}

export async function hideNotice(): Promise<void> {
  if (isDesktop) await invoke("hide_notice");
}

export async function onNotice(cb: (n: Notice) => void): Promise<() => void> {
  if (!isDesktop) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<Notice>(NOTICE_EVENT, (e) => cb(e.payload));
}

// ---- Email (IMAP). Passwords go to the OS keychain and never into app data. ----

export async function mailConnect(account: MailAccount, password: string): Promise<void> {
  if (!isDesktop) throw new Error("Email works in the desktop app.");
  await invoke("mail_connect", { account, password });
}

export async function mailFetch(account: MailAccount): Promise<MailMessage[]> {
  if (!isDesktop) throw new Error("Email works in the desktop app.");
  return invoke<MailMessage[]>("mail_fetch", { account, days: 14, limit: 60 });
}

export async function mailForget(account: MailAccount): Promise<void> {
  if (isDesktop) await invoke("mail_forget", { account });
}

/** Download a subscribed calendar's .ics text (desktop app only). */
export async function calendarFetch(url: string): Promise<string> {
  if (!isDesktop) throw new Error("Calendars sync in the desktop app.");
  return invoke<string>("calendar_fetch", { url });
}

export async function eraseAllData(): Promise<void> {
  if (isDesktop) await invoke("erase_state");
  else {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
