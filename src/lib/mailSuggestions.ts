import { useMemo } from "react";
import { suggestFromMail, type MailSuggestion } from "./mail";
import { today, useStore } from "./store";
import type { MailMessage } from "./types";

export interface MailItem {
  message: MailMessage;
  suggestion: MailSuggestion | null;
}

/** Recent messages, split into the ones that need the user and the rest. */
export function useMailItems(): { needsYou: MailItem[]; rest: MailItem[] } {
  const messages = useStore((s) => s.mail.messages);
  const handled = useStore((s) => s.mail.handled);
  return useMemo(() => {
    const d = today();
    const items = [...messages].sort((a, b) => b.date - a.date).map((message) => ({ message, suggestion: suggestFromMail(message, d) }));
    const done = new Set(handled);
    return {
      needsYou: items.filter((i) => i.suggestion && !done.has(i.message.id)),
      rest: items.filter((i) => !i.suggestion || done.has(i.message.id)),
    };
  }, [messages, handled]);
}
