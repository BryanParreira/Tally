import { DAY_PHRASE, resolveDayPhrase } from "./date";
import type { Category } from "./types";

export interface ParsedItem {
  title: string;
  category: Category;
  duration: number;
  /** Pinned start time in minutes after midnight. */
  start: number | null;
  /** Day to plan it on, when the text names one ("tomorrow", "on friday"). */
  date: string | null;
  due: string | null;
}

const STUDY_WORDS =
  /\b(study|studying|exam|midterm|final|quiz|test|homework|hw|assignment|essay|paper|thesis|lab|lecture|class|chapter|ch\.?\s?\d|revise|revision|review notes|flashcards?|read(?:ing)?|course|module|problem set|pset|tutor|school|uni|university|college|syllabus)\b/i;
const WORK_WORDS =
  /\b(meeting|standup|stand-up|sync|report|client|deck|slides|presentation|invoice|proposal|email|emails|inbox|reply|respond|follow up|follow-up|shift|manager|boss|team|project|deadline|ticket|pr|code review|interview|spreadsheet|budget|1:1|one on one)\b/i;

/** Rough default lengths so a plan looks realistic before the user tweaks anything. */
const DEFAULT_DURATIONS: [RegExp, number][] = [
  [/\b(essay|paper|thesis|project|presentation|deck|problem set|pset)\b/i, 90],
  [/\b(study|studying|revise|revision|homework|hw|assignment|lab|chapter|read(?:ing)?|exam|midterm)\b/i, 60],
  [/\b(gym|workout|run|running|yoga|swim|training)\b/i, 60],
  [/\b(lecture|class|meeting|interview)\b/i, 60],
  [/\b(groceries|shopping|laundry|clean|cleaning|cook|cooking|dinner|lunch)\b/i, 45],
  [/\b(standup|stand-up|sync|1:1)\b/i, 15],
  [/\b(call|phone|ring|text)\b/i, 20],
  [/\b(reply|respond|email|emails|message|pay|book|schedule|send|submit|print|sign)\b/i, 15],
];

const SPLIT = /\s*(?:\n|;|,(?![^(]*\))|•|\s+and then\s+|\s+then\s+)\s*/i;

export function guessCategory(text: string): Category {
  if (STUDY_WORDS.test(text)) return "study";
  if (WORK_WORDS.test(text)) return "work";
  return "life";
}

/** Tasks that start with a quick verb ("reply to…", "call…") stay short whatever they mention. */
const QUICK_START: [RegExp, number][] = [
  [/^\s*(?:reply|respond|answer|email|text|message|pay|book|send|submit|print|sign|confirm|rsvp)\b/i, 15],
  [/^\s*(?:call|phone|ring)\b/i, 20],
];

export function guessDuration(text: string): number {
  for (const [re, minutes] of QUICK_START) if (re.test(text)) return minutes;
  for (const [re, minutes] of DEFAULT_DURATIONS) if (re.test(text)) return minutes;
  return 30;
}

function to24h(hour: number, minute: number, meridiem: string | undefined): number | null {
  if (hour > 23 || minute > 59) return null;
  let h = hour;
  const mer = meridiem?.toLowerCase().replace(/\./g, "");
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  // "at 3" with no am/pm almost always means the afternoon.
  if (!mer && h >= 1 && h <= 7) h += 12;
  return h * 60 + minute;
}

export function parseItem(raw: string, today: string): ParsedItem | null {
  let text = raw.replace(/^\s*(?:[-*–—>]+|\d+[.)]|\[\s?\]|todo:?)\s*/i, "").trim();
  if (!text) return null;

  let duration: number | null = null;
  let start: number | null = null;
  let date: string | null = null;
  let due: string | null = null;

  const cut = (re: RegExp, fn: (m: RegExpMatchArray) => boolean) => {
    const m = text.match(re);
    if (m && fn(m)) text = (text.slice(0, m.index) + " " + text.slice((m.index ?? 0) + m[0].length)).trim();
  };

  // Durations: "for 45 min", "2h", "1.5 hours", "half an hour", "an hour"
  cut(/\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|mins?|minutes?)\b/i, (m) => {
    const n = Number(m[1]);
    duration = Math.round(/^h/i.test(m[2]) ? n * 60 : n);
    return duration > 0;
  });
  if (duration === null)
    cut(/\b(?:for\s+)?(half an hour|an hour)\b/i, (m) => {
      duration = m[1].toLowerCase() === "an hour" ? 60 : 30;
      return true;
    });
  if (duration === null && /\bquick\b/i.test(text)) duration = 15;

  // Deadlines: "by friday", "due oct 22", "before tomorrow"
  cut(new RegExp(`\\b(?:by|due(?:\\s+on|\\s+by)?|before|until|deadline)\\s+(${DAY_PHRASE})\\b`, "i"), (m) => {
    due = resolveDayPhrase(m[1], today);
    return due !== null;
  });

  // Times: "at 3pm", "at 15:30", "3:30 pm", "@ 9"
  cut(/(?:\bat\s+|@\s*)(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?=\s|$|[^\w])/i, (m) => {
    start = to24h(Number(m[1]), Number(m[2] ?? 0), m[3]);
    return start !== null;
  });
  if (start === null)
    cut(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\s|$|[^\w])/i, (m) => {
      start = to24h(Number(m[1]), Number(m[2] ?? 0), m[3]);
      return start !== null;
    });
  if (start === null)
    cut(/\b([01]?\d|2[0-3]):([0-5]\d)\b/, (m) => {
      start = Number(m[1]) * 60 + Number(m[2]);
      return true;
    });

  // Planned day: "tomorrow", "on friday", "next monday"
  cut(new RegExp(`(?:\\bon\\s+)?\\b(${DAY_PHRASE})\\b`, "i"), (m) => {
    // "plan next week" is about the week, not a day to do it on.
    if (/^next week$/i.test(m[1])) return false;
    date = resolveDayPhrase(m[1], today);
    return date !== null;
  });

  const title = text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/^(?:i need to|i have to|need to|have to|must|remember to|don'?t forget to|gotta|i should|should)\s+/i, "")
    .replace(/\s+(?:by|at|on|for|due|before|until|and)$/i, "")
    .replace(/[,;:\s]+$/, "")
    .trim();
  if (!title) return null;

  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    category: guessCategory(raw),
    duration: duration ?? guessDuration(raw),
    start,
    date,
    due,
  };
}

/** Turn a free-form brain dump into separate, structured tasks. */
export function parseBrainDump(text: string, today: string): ParsedItem[] {
  return text
    .split(SPLIT)
    .map((part) => parseItem(part, today))
    .filter((item): item is ParsedItem => item !== null);
}
