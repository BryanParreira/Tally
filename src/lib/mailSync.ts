/**
 * Syncing every connected inbox, with feedback the UI can show: which inbox is
 * syncing right now, how far a "sync all" has got, and what each one found.
 */
import { create } from "zustand";
import { mailFetch } from "./native";
import { useStore } from "./store";
import type { MailAccount } from "./types";

interface SyncState {
  /** Inbox ids being synced right now. */
  syncing: string[];
  /** Progress of a "sync all": inboxes finished out of the total. */
  progress: { done: number; total: number } | null;
}

export const useMailSync = create<SyncState>(() => ({ syncing: [], progress: null }));

/** The name shown for an inbox: its nickname, or the address. */
export function inboxName(a: Pick<MailAccount, "name" | "username" | "host">): string {
  return a.name?.trim() || a.username || a.host;
}

/** Turn a raw IMAP or keychain error into something a person can act on. */
export function mailErrorText(err: unknown): string {
  const raw = typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
  // Microsoft sign-in errors already arrive in plain words after a short code.
  const plain = raw.match(/^(setup|admin|cancelled): (.+)$/s);
  if (plain) return plain[1] === "setup" ? `${plain[2]} The app's Microsoft ID needs to be added first (see the README).` : plain[2];
  if (/^login: .*Microsoft/s.test(raw)) return raw.replace(/^login: /, "");
  if (/no saved password/i.test(raw)) return "The saved password is missing. Reconnect this inbox.";
  if (/auth|login|credential|password|invalid/i.test(raw)) return "Sign-in failed. Check the address and app password. Your regular password won't work for most providers.";
  if (/dns|resolve|connect|timed out|network|unreachable/i.test(raw)) return "Couldn't reach the mail server. Check your internet connection and the server name.";
  return raw;
}

export interface SyncResult {
  /** Messages that weren't there before this sync. */
  added: number;
  /** All recent messages the inbox returned. */
  found: number;
  error?: string;
}

/** Sync one inbox and record how it went on the account. */
export async function syncInbox(account: MailAccount): Promise<SyncResult> {
  const known = new Set(useStore.getState().mail.messages.filter((m) => m.accountId === account.id).map((m) => m.id));
  useMailSync.setState((s) => ({ syncing: [...s.syncing.filter((id) => id !== account.id), account.id] }));
  try {
    const messages = await mailFetch(account);
    useStore.getState().setMessages(account.id, messages);
    return { added: messages.filter((m) => !known.has(m.id)).length, found: messages.length };
  } catch (err) {
    const error = mailErrorText(err);
    useStore.getState().updateMailAccount(account.id, { error });
    return { added: 0, found: known.size, error };
  } finally {
    useMailSync.setState((s) => ({ syncing: s.syncing.filter((id) => id !== account.id) }));
  }
}

/** Sync every inbox one after another, reporting progress as it goes. */
export async function syncAllInboxes(): Promise<{ added: number; failed: MailAccount[] }> {
  const accounts = useStore.getState().mail.accounts;
  if (!accounts.length || useMailSync.getState().progress) return { added: 0, failed: [] };
  let added = 0;
  const failed: MailAccount[] = [];
  useMailSync.setState({ progress: { done: 0, total: accounts.length } });
  for (const [i, a] of accounts.entries()) {
    const r = await syncInbox(a);
    added += r.added;
    if (r.error) failed.push(a);
    useMailSync.setState({ progress: { done: i + 1, total: accounts.length } });
  }
  useMailSync.setState({ progress: null });
  return { added, failed };
}
