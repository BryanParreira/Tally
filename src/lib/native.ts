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
export const NAVIGATE_EVENT = "kindred://navigate";

/** A reminder card shown in the corner of the screen, over any app. */
export interface Notice {
  id: string;
  /** A task starting (with Done), or a calendar event starting. */
  kind: "task" | "event";
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
  return cls.contains("notice-window") ? "notice" : cls.contains("tray-window") ? "tray" : "main";
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

/** Match the native parts (title bar, frosted panels, form controls, window background) to Kindred's theme. */
export async function setNativeTheme(theme: "system" | "light" | "dark", dark: boolean): Promise<void> {
  if (isDesktop) await invoke("set_native_theme", { theme, dark });
}

/**
 * Floating windows get native frosted glass and shadow on macOS, so their CSS
 * draws no shadow of its own there. Other systems use a painted panel.
 */
export function markFloatingWindow() {
  document.documentElement.classList.toggle("native-glass", isDesktop && isMac);
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

/** Outlook and Microsoft 365 inboxes are read through Microsoft Graph; everything else over IMAP. */
const isOutlook = (account: MailAccount) => account.provider === "outlook";

export async function mailFetch(account: MailAccount): Promise<MailMessage[]> {
  if (!isDesktop) throw new Error("Email works in the desktop app.");
  if (isOutlook(account)) return invoke<MailMessage[]>("outlook_fetch", { username: account.username, days: 14, limit: 60 });
  return invoke<MailMessage[]>("mail_fetch", { account, days: 14, limit: 60 });
}

/** Which provider hosts an email domain ("outlook" for schools on Microsoft 365, "gmail", …), from its mail servers. */
export async function domainProvider(domain: string): Promise<string | null> {
  if (!isDesktop) return null;
  return invoke<string | null>("mail_domain_provider", { domain }).catch(() => null);
}

/** Sign in with Microsoft in the browser. Resolves with the account's address once it's done. */
export async function outlookConnect(): Promise<{ email: string; name: string }> {
  if (!isDesktop) throw new Error("Email works in the desktop app.");
  return invoke<{ email: string; name: string }>("outlook_connect");
}

/** The original HTML of one email, fetched when you open it. `null` for plain-text mail. */
export async function mailBody(account: MailAccount, id: string): Promise<string | null> {
  if (!isDesktop) return null;
  if (isOutlook(account)) return invoke<string | null>("outlook_body", { username: account.username, id });
  return invoke<string | null>("mail_body", { account, id });
}

export async function mailForget(account: MailAccount): Promise<void> {
  if (!isDesktop) return;
  if (isOutlook(account)) await invoke("outlook_forget", { username: account.username });
  else await invoke("mail_forget", { account });
}

/** Download a subscribed calendar's .ics text (desktop app only). */
export async function calendarFetch(url: string): Promise<string> {
  if (!isDesktop) throw new Error("Calendars sync in the desktop app.");
  return invoke<string>("calendar_fetch", { url });
}

/** Save a backup file. Desktop: Downloads folder (returns its path). Browser: a download. */
export async function saveBackup(json: string): Promise<string | null> {
  if (isDesktop) return invoke<string>("save_backup", { contents: json });
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `Kindred-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return null;
}

export async function revealFile(path: string): Promise<void> {
  if (!isDesktop) return;
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

// ---- CalDAV (Apple iCloud, Fastmail, Nextcloud…). The app password stays in the OS keychain. ----

export interface DavReply {
  status: number;
  body: string;
}

export async function caldavConnect(accountId: string, server: string, username: string, password: string, probe: string): Promise<DavReply> {
  if (!isDesktop) throw new Error("Calendar accounts work in the desktop app.");
  return invoke<DavReply>("caldav_connect", { accountId, server, username, password, probe });
}

export async function caldavRequest(accountId: string, server: string, username: string, url: string, method: string, depth: string, body: string): Promise<DavReply> {
  if (!isDesktop) throw new Error("Calendar accounts work in the desktop app.");
  return invoke<DavReply>("caldav_request", { accountId, server, username, url, method, depth, body });
}

export async function caldavForget(accountId: string, username: string): Promise<void> {
  if (isDesktop) await invoke("caldav_forget", { accountId, username });
}

// ---- Tray panel ----

/** Open the main window on a page ("today", "inbox", … or "search"). */
export async function openView(view: string): Promise<void> {
  if (isDesktop) await invoke("open_view", { view });
}

export async function hideTray(): Promise<void> {
  if (isDesktop) await invoke("hide_tray");
}

export async function quitApp(): Promise<void> {
  if (isDesktop) await invoke("quit_app");
}

export async function onNavigate(cb: (view: string) => void): Promise<() => void> {
  if (!isDesktop) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<string>(NAVIGATE_EVENT, (e) => cb(e.payload));
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
