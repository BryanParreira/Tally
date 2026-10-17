import { DAY_PHRASE, dateKey, resolveDayPhrase } from "./date";
import { guessCategory, guessDuration } from "./parse";
import type { Category, MailMessage } from "./types";

export interface MailSuggestion {
  messageId: string;
  title: string;
  category: Category;
  duration: number;
  due: string | null;
  /** Plain-language reason shown under the suggestion. */
  reason: string;
  kind: "deadline" | "request" | "event";
}

export interface ProviderPreset {
  id: string;
  label: string;
  host: string;
  port: number;
  /** Where the user creates an app password for IMAP access. */
  help: string;
}

export const PROVIDERS: ProviderPreset[] = [
  { id: "gmail", label: "Gmail", host: "imap.gmail.com", port: 993, help: "https://myaccount.google.com/apppasswords" },
  { id: "outlook", label: "Outlook", host: "graph.microsoft.com", port: 443, help: "" },
  { id: "icloud", label: "iCloud Mail", host: "imap.mail.me.com", port: 993, help: "https://account.apple.com" },
  { id: "yahoo", label: "Yahoo Mail", host: "imap.mail.yahoo.com", port: 993, help: "https://login.yahoo.com/account/security" },
  { id: "fastmail", label: "Fastmail", host: "imap.fastmail.com", port: 993, help: "https://www.fastmail.com/settings/security/devicekeys" },
  { id: "other", label: "Other (IMAP)", host: "", port: 993, help: "" },
];

/** Addresses that sign in with Microsoft: Outlook.com and schools on Microsoft 365. */
const MICROSOFT_DOMAINS = /@(outlook|hotmail|live|msn)\.[a-z.]+$|@([a-z0-9-]+\.)*minnstate\.edu$/i;

export function isMicrosoftAddress(email: string): boolean {
  return MICROSOFT_DOMAINS.test(email.trim());
}

const NOISE_SENDER = /(no-?reply|newsletter|marketing|promo|offers|deals|digest|news@|updates@|mailer-daemon)/i;
const SCHOOL_SENDER = /(\.edu\b|\.ac\.[a-z]{2}\b|instructure|canvas|blackboard|moodle|classroom\.google|brightspace|d2l)/i;

const DEADLINE = new RegExp(`\\b(?:due|deadline|submit(?:ted)?|turn in|hand in)\\b[^.\\n]{0,40}?\\b(?:by|on|before)?\\s*(${DAY_PHRASE})`, "i");
const BY_DAY = new RegExp(`\\bby\\s+(${DAY_PHRASE})\\b`, "i");
const REQUEST = /\b(can you|could you|would you|please (?:send|reply|confirm|review|complete|submit|sign|fill|share|let me know|update|check)|let me know|get back to me|rsvp|are you able to|any chance you)\b/i;
const EVENT = /\b(meeting|invitation|invite|join us|webinar|zoom\.us|teams\.microsoft|meet\.google|calendar|appointment|interview)\b/i;

function cleanSubject(subject: string): string {
  return subject
    .replace(/^\s*((re|fw|fwd|aw|tr)\s*:\s*)+/i, "")
    .replace(/^\s*(reminder|action required|important|urgent)\s*[:\-–]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstName(name: string, address: string): string {
  const n = name.trim().replace(/^(prof\.?|dr\.?|mr\.?|ms\.?|mrs\.?)\s+/i, "");
  if (n) return n.split(/\s+/)[0];
  return address.split("@")[0].split(/[._-]/)[0].replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Find the emails that actually ask something of the user and turn each one
 * into a task suggestion. Runs entirely on-device.
 */
export function suggestFromMail(msg: MailMessage, today = dateKey(new Date())): MailSuggestion | null {
  const subject = cleanSubject(msg.subject || "(no subject)");
  const body = msg.text.slice(0, 3000);
  const all = `${subject}\n${body}`;
  const school = SCHOOL_SENDER.test(msg.fromAddress);

  const deadlineMatch = all.match(DEADLINE) ?? all.match(BY_DAY);
  const due = deadlineMatch ? resolveDayPhrase(deadlineMatch[1], today) : null;
  const request = REQUEST.test(all);
  const event = EVENT.test(subject) || (EVENT.test(body) && /\b(at|on)\s+\d/.test(body));

  // Bulk mail only gets through when it carries a real deadline (course notifications do).
  const noisy = msg.bulk || NOISE_SENDER.test(msg.fromAddress);
  if (noisy && !(due && (school || DEADLINE.test(all)))) return null;
  // A real person asking you something directly also needs an answer.
  const asks = !noisy && /\?(\s|$)/.test(`${subject} ${body.slice(0, 1200)}`);
  if (!due && !request && !asks && !event) return null;

  const category: Category = school ? "study" : guessCategory(all);
  const who = firstName(msg.fromName, msg.fromAddress);

  if (due && (DEADLINE.test(all) || !request)) {
    return {
      messageId: msg.id,
      title: subject,
      category,
      duration: guessDuration(all),
      due,
      reason: `Mentions a deadline in ${msg.fromName || msg.fromAddress}'s email`,
      kind: "deadline",
    };
  }
  if (request || asks) {
    return {
      messageId: msg.id,
      title: `Reply to ${who}: ${subject}`,
      category,
      duration: 15,
      due,
      reason: `${who} is asking you something`,
      kind: "request",
    };
  }
  return {
    messageId: msg.id,
    title: subject,
    category,
    duration: 60,
    due,
    reason: "Looks like an invitation or meeting",
    kind: "event",
  };
}

export function draftReply(msg: MailMessage, suggestion: MailSuggestion | null, myName: string, formatDue: (key: string) => string): string {
  const who = firstName(msg.fromName, msg.fromAddress);
  let line = "Thanks for your email. I'll get back to you shortly.";
  if (suggestion?.kind === "deadline" && suggestion.due) line = `Thanks for the reminder. I'll have it done by ${formatDue(suggestion.due)}.`;
  else if (suggestion?.kind === "request") line = "Thanks for reaching out. Happy to help, and I'll follow up soon with the details.";
  else if (suggestion?.kind === "event") line = "Thanks for the invite. That works for me, see you then.";
  return `Hi ${who},\n\n${line}\n\nBest,\n${myName || ""}`.trimEnd();
}

export function mailtoLink(msg: MailMessage, body: string): string {
  const subject = /^re:/i.test(msg.subject) ? msg.subject : `Re: ${msg.subject}`;
  return `mailto:${encodeURIComponent(msg.fromAddress)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
