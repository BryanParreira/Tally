export type Category = "study" | "work" | "life";
export type TaskSource = "manual" | "dump" | "email" | "study" | "note";

export interface Task {
  id: string;
  title: string;
  category: Category;
  /** Day the task is planned for, as YYYY-MM-DD (local time). */
  date: string;
  /** Minutes after midnight. Only meaningful when `fixed` or `done`. */
  start: number | null;
  /** Pinned to a time (a class, a meeting, "at 3pm"). The scheduler never moves it. */
  fixed: boolean;
  /** Minutes. */
  duration: number;
  done: boolean;
  doneAt?: number;
  /** Deadline as YYYY-MM-DD. Earlier deadlines are scheduled first. */
  due?: string;
  source: TaskSource;
  sourceRef?: string;
  createdAt: number;
}

export interface Settings {
  /** Minutes after midnight. */
  dayStart: number;
  dayEnd: number;
  /** Insert a break after this many minutes of back-to-back work. */
  breakEvery: number;
  breakLength: number;
  theme: "system" | "light" | "dark";
  nowBar: boolean;
  /** Gentle on-screen reminders when a task starts or a focus session ends. */
  reminders: boolean;
}

export interface FocusSession {
  taskId: string;
  /** Epoch ms when the current run started; null while paused. */
  runningSince: number | null;
  /** Ms already focused before the current run. */
  elapsed: number;
}

export interface MailAccount {
  provider: string;
  host: string;
  port: number;
  username: string;
}

export interface MailMessage {
  id: string;
  fromName: string;
  fromAddress: string;
  subject: string;
  /** Epoch ms. */
  date: number;
  text: string;
  bulk: boolean;
}

export interface Topic {
  id: string;
  name: string;
  done: boolean;
}

export interface Course {
  id: string;
  name: string;
  examDate: string;
  minutesPerDay: number;
  topics: Topic[];
}

export interface Card {
  id: string;
  courseId: string | null;
  front: string;
  back: string;
  ease: number;
  interval: number;
  reps: number;
  due: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface DayStats {
  focusMinutes: number;
}

export interface AppData {
  version: 1;
  onboarded: boolean;
  name: string;
  settings: Settings;
  tasks: Task[];
  focus: FocusSession | null;
  stats: Record<string, DayStats>;
  mail: {
    account: MailAccount | null;
    messages: MailMessage[];
    handled: string[];
    lastSync: number | null;
  };
  courses: Course[];
  cards: Card[];
  notes: Note[];
}
