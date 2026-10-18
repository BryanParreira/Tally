# Tally

**Your day, planned for you.** Tally is a calm desktop app for macOS and Windows that turns a quick brain dump, your inbox and your courses into a realistic daily plan, then keeps that plan on track as your day changes.

Everything runs on your computer. There is no account, no cloud and no tracking.

![Today](docs/today.png)

## What it does

- **One loop: Inbox → Today → done.** Everything that arrives lands in the **Inbox**, sorted into *Needs a reply*, *Deadlines* and *To do* (with *Waiting* and *Other* one tab away). Each item gets one decision: **Today** (`T`), **Schedule** (`S`), **Wait** for a reply (`W`, it comes back if nobody answers) or **Done** (`E`). Tasks made from an email stay linked to it.
- **Today: your list beside your day.** Today's tasks on the left, the day's calendar on the right. Drag a task onto the calendar to give it a time; move and resize anything. A slim Now/Next line keeps you oriented.
- **Brain dump → plan.** Type something like `finish history essay by friday, gym at 6pm, call mom tomorrow` and Tally works out the tasks, how long each takes, any fixed times and deadlines, then fits them into your day. Add `#tags`, and mark priority with `!` (high) or `!!` (urgent).
- **A plan that fixes itself.** Running late or skipped something? The rest of the day reflows around your calendar, urgent work goes first, and breaks are added after long stretches. Unfinished work moves to tomorrow and shows up in your inbox as "carried over", so nothing silently piles up.
- **Your calendar, privately.** Paste your calendar's iCal link (Google, iCloud, Outlook or a school portal). Classes and meetings, including weekly repeats, become fixed blocks that Tally plans around. No account sign-in needed.
- **Talk to it.** Ask about your day or inbox, or just say what you need: add tasks, "mark the essay done", "move gym to 7pm", "push everything to tomorrow", each with Undo. Runs on a local model; nothing leaves your computer.
- **A calm start and finish.** A morning card with your plan and what is due, and an evening nudge to wrap up.
- **Checklists, repeats and imports.** Steps inside a task, "every monday" tasks, and import from Todoist, CSV, calendar to-dos or a plain list. Meeting emails become calendar events in one tap.
- **A Tasks page.** `G` `T`. A left rail of views (All, Today, Upcoming, Someday, Done), areas and tags; display as a list, a board or a four-week timeline; group and sort; filter with `F`. `1`–`5` switch views, `V` changes the display, `[` hides the rail.
- **Projects.** `G` `P`. For anything with an end in sight (a course, a thesis, a trip): a status, a target date, a description and a progress bar. Tasks join a project from their details or from the project's own Tasks tab, and each project shows in the Tasks rail.
- **Pinned.** Pin a task, note or project (the pin in its header) and it appears under *Pinned* in the sidebar.
- **Today shows what's next.** A *Recent* list of what you opened last, and one quiet *Next* line when something is pressing (an email deadline, a project with late tasks).
- **@-links.** Type `[[` in a note or a task's details to link to a note, task or email. Each page shows what it links to and what links back, and renaming something keeps its links working.
- **Recall.** Ask Tally about something you wrote or received ("what did Sam ask me for?") and it finds the matching notes, tasks and emails on your computer first.
- **One place for your day.** Tasks live on Today: a timeline that fits them around your calendar, a details panel for time, length, tags and notes, and a *Plan my day* picker for deadlines and your someday backlog.
- **A premium calendar.** Day, week and month views with a mini month picker, your calendars listed with show/hide checkboxes, and Tally's planned tasks right next to your events. Drag on the grid to create, drag an event or task to move it, drag its bottom edge to change its length, and create your own events (with repeats) in *My calendar*. Keys: `d` `w` `m` for views, `t` for today, `j`/`k` to move, `c` to create.
- **Apple Calendar and more.** Sign in to Apple iCloud, Fastmail, Nextcloud or any CalDAV account with an app-specific password; subscribe to Google, Outlook or school calendars by link; or import an `.ics` file.
- **Contacts.** Click a sender, or search a name in `⌘K`, to see their email and the tasks and notes that mention them.
- **Several inboxes, one list.** Connect personal, school and work email; each gets its own name and colour, and you can view all inboxes together or one at a time. Each inbox shows when it last synced and how many emails need you, and one that can't sign in says why and offers *Reconnect*.
- **Tray panel.** Click the Tally icon in the menu bar (Mac) or taskbar (Windows) for a small panel with Today, Inbox, Calendar and Notes views (press `1`–`4` or the arrow keys), quick add and what's next. Right-click for the classic menu.
- **One inbox for everything.** Email, carried-over tasks and tasks written in notes, all in one list split into **Signal** (needs you) and **Noise** (can wait), grouped by day, with a reading pane. Press `j`/`k` to move, `space` to preview, `e` for done, `a` to accept.
- **Email that turns into tasks.** Connect Gmail, iCloud, Yahoo, Fastmail or any IMAP account. Deadlines and requests become task suggestions, and replies are drafted for you.
- **Copy my free time.** One click turns your open time over the next few days into a message you can paste into a reply.
- **Reminder cards.** Tally's own notification card appears in the corner of your screen when a task or a calendar event begins, with *Done* or *Open calendar*. No timers, no tracking.
- **Notes and snippets.** A quiet, paper-like place to write. Lines that start with `[ ]` or `/task` become tasks, `#tags` link notes to tasks, and typing `;` inserts a template (lecture notes, meeting notes, weekly review…).
- **Keyboard first.** `⌘K`/`Ctrl K` searches everything (try `#bio`), `c` opens the create launcher (`c` `t` task, `c` `n` note, `c` `s` snippet, `c` `o` course), `g` then `h`/`i`/`t`/`r`/`n` switches between Today, Inbox, Tasks, Calendar and Notes, `⌘.`/`Ctrl .` folds the sidebar, `p` changes priority, `s` status, `?` shows them all.
- **Safe by design.** No account, no cloud, no analytics. Settings shows exactly what Tally connects to (only the email server and calendar links you add), and you can export a full backup file at any time and restore it later.
- **Ask Tally: a built-in AI assistant.** Press `⌘J`/`Ctrl J`. It plans your rest of the day, says what to do first, sums up your inbox, breaks a goal into steps you can add as tasks, writes email replies and summarizes notes or finds the tasks in them. It runs entirely on your computer: the llama.cpp engine is inside Tally and the model is NVIDIA's Nemotron 3 Nano (4B). Tally fetches the model (2.8 GB) once in the background after first launch, or you can bundle it into the installer (see below). Nothing you ask leaves your machine.
- **Crisp light and dark themes.** A clean, Inter-based interface with one indigo accent, a near-black dark theme that follows your system (or a one-click toggle), and smooth cross-fades between them. Every delete can be undone.

| Calendar (week) | Calendar (month) | Tray panel |
| --- | --- | --- |
| ![Calendar](docs/calendar.png) | ![Month](docs/calendar-month.png) | ![Tray](docs/tray.png) |

| Tasks | Board | Night |
| --- | --- | --- |
| ![Tasks](docs/tasks.png) | ![Board](docs/board.png) | ![Night](docs/today-night.png) |

| Unified inbox | Snippets | Free time |
| --- | --- | --- |
| ![Inbox](docs/inbox.png) | ![Snippets](docs/snippets.png) | ![Free time](docs/free-time.png) |

| Create launcher | Reminder card |
| --- | --- |
| ![Create](docs/create.png) | ![Reminder](docs/reminder.png) |


## Run it on your computer

### 1. Install the tools (one time)

**macOS**

```bash
xcode-select --install                                           # Apple's command line tools
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   # Rust (press Enter for defaults)
brew install node                                                # Node.js 20+ (or download it from nodejs.org)
```

**Windows** (PowerShell)

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
winget install Rustlang.Rustup
winget install OpenJS.NodeJS.LTS
```

Then close and reopen your terminal. Windows 10 and 11 already include WebView2, which Tally uses to draw its windows.

### 2. Get the code and start the app

```bash
git clone https://github.com/BryanParreira/tally.git
cd tally
npm install
npm run app:dev
```

The first start compiles the Rust side, which takes a few minutes. Later starts take seconds.

### 3. Build an installer

```bash
npm run app:build
```

| Platform | Where the installer ends up |
| --- | --- |
| macOS | `src-tauri/target/release/bundle/dmg/Tally_0.1.0_*.dmg` |
| Windows | `src-tauri\target\release\bundle\nsis\Tally_0.1.0_x64-setup.exe` (and an `.msi`) |

For a single Mac build that runs on both Apple Silicon and Intel:
`rustup target add aarch64-apple-darwin x86_64-apple-darwin && npm run app:build -- --target universal-apple-darwin`

Every push to `main` also builds the macOS and Windows installers on GitHub Actions. Download them from the run's **Artifacts** section. Pushing a tag like `v0.1.0` publishes them as a GitHub Release.

> **Unsigned builds:** until the app is code-signed, macOS will say it "can't be opened". Right-click Tally in Applications → **Open** → **Open**. On Windows, SmartScreen may show "Windows protected your PC": click **More info** → **Run anyway**.

### Automatic updates

Installed copies of Tally check GitHub Releases for a newer version a few seconds after launch and every six hours. Under Settings → General → Updates you choose **Automatic** (installs by itself shortly after Tally opens), **Ask me** (offers the update) or **Off**. Updates are signed, and the app refuses any download whose signature doesn't match the public key in `src-tauri/tauri.conf.json`.

To publish an update:

1. One time: add the signing key to the repo's **Settings → Secrets and variables → Actions**:
   - `TAURI_SIGNING_PRIVATE_KEY`: the contents of `~/.tauri/tally.key` (create one with `npx tauri signer generate -w ~/.tauri/tally.key`, then paste the printed public key into `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`) (keep this file safe and private; without it you can't ship updates)
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: leave empty unless you set one
   - `TALLY_MS_CLIENT_ID`: your Microsoft app ID, so Outlook sign-in is built in
2. Bump `version` in `package.json` and `src-tauri/tauri.conf.json`, commit, then tag and push: `git tag v0.2.0 && git push --tags`.
3. GitHub Actions builds macOS and Windows, signs them, and publishes the release with `latest.json`. Every installed copy picks it up.

### The built-in assistant's model

The engine ([llama.cpp](https://github.com/ggml-org/llama.cpp), via the `llama-cpp-2` crate) is compiled into Tally; building needs `cmake` and a C++ compiler (Xcode tools on macOS, Visual Studio Build Tools on Windows). On Apple Silicon it runs on the GPU through Metal.

The model is [NVIDIA-Nemotron-3-Nano-4B](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-4B-GGUF) (Q4_K_M, 2.8 GB). By default Tally downloads it once after first launch into its data folder, with a progress bar in Settings, resume after interruption and a **Remove model** button. To ship it inside the installer instead, put `NVIDIA-Nemotron3-Nano-4B-Q4_K_M.gguf` in `src-tauri/models/` before `npm run app:build`. Note that GitHub Releases limit each file to 2 GB, so a bundled installer can't be published there; that's why downloading is the default.

Check it on your machine: `TALLY_TEST_MODEL=/path/to/model.gguf cargo test --manifest-path src-tauri/Cargo.toml ai:: -- --ignored --nocapture`.

### Try just the interface in a browser

```bash
npm run dev    # then open http://localhost:1420
```

Everything except email and the reminder cards works in the browser preview, and data is kept in browser storage.

## Connecting email

Tally connects directly from your computer to your provider over IMAP. Your password is stored in your system's secure keychain (Keychain on macOS, Credential Manager on Windows), never in Tally's data file.

Most providers need an **app password** rather than your normal password:

- **Gmail:** turn on 2-Step Verification, then create one at <https://myaccount.google.com/apppasswords>.
- **iCloud:** account.apple.com → Sign-In and Security → App-Specific Passwords.
- **Yahoo / Fastmail:** create an app password in the account's security settings.

### Outlook, Hotmail and school Microsoft 365 accounts (like @minnstate.edu)

These use **Sign in with Microsoft**: Tally opens your browser, you sign in (including your school's two-step check), and Microsoft gives Tally read-only access to your mail. Mail is read through Microsoft Graph straight to your computer; the sign-in token is kept in your system keychain.

This needs Tally to be registered with Microsoft once (free, about 5 minutes):

1. Sign in to <https://entra.microsoft.com> (any Microsoft account works) → **Applications → App registrations → New registration**.
2. Name: `Tally`. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
3. Redirect URI: platform **Public client/native (mobile & desktop)**, value `http://localhost`. Register.
4. **API permissions → Add a permission → Microsoft Graph → Delegated**: add `Mail.Read`, `User.Read` and `offline_access`.
5. Copy the **Application (client) ID** from the Overview page.
6. Run Tally with it: `TALLY_MS_CLIENT_ID=<your id> npm run app:dev`, or build with the same variable set so it's included in the installer.

Some schools only allow apps their IT team has approved. If a student sees "Your school needs to approve Tally", the school's IT can grant consent for the app once for everyone. Completing Microsoft's publisher verification makes this much less likely.

## Connecting a calendar

Settings → **Calendars** offers three ways:

**Apple iCloud & CalDAV** (Apple Calendar, Fastmail, Nextcloud…): sign in with your account email and an *app-specific password*. For iCloud, create one at account.apple.com → Sign-In and Security → App-Specific Passwords. Tally finds all your calendars, keeps the password in your system keychain, and only ever reads from your provider.

**Calendar link** (Google, Outlook, school portals): paste the private iCal link:

- **Google Calendar:** Settings → your calendar → Integrate calendar → *Secret address in iCal format*.
- **iCloud:** Calendar app → right-click the calendar → Share → *Public Calendar* → copy the link.
- **Outlook:** Settings → Calendar → Shared calendars → *Publish a calendar* → ICS link.
- **Brightspace (D2L):** Calendar → Subscribe → "All courses" → copy the link.
- **Canvas, Moodle, Blackboard:** look for "Calendar feed".

Brightspace, Canvas and other course links turn on **Course calendar** automatically: assignment deadlines go to Tasks with their due date (planned the day before), classes and exams stay on the calendar, and "quiz opens" markers are skipped. If the teacher moves a deadline, the task follows. Delete one and it stays deleted.

**Import a file**: choose an `.ics` file exported from any calendar app.

Tally refreshes connected calendars every 30 minutes. Subscribed calendars are read-only in Tally; events you create live in *My calendar*, on your computer.

## Where your data lives

| Platform | Location |
| --- | --- |
| macOS | `~/Library/Application Support/app.tally.desktop/tally-data.json` |
| Windows | `%APPDATA%\app.tally.desktop\tally-data.json` |

Settings → **Erase everything** deletes it, including the saved email password.

## Development

```bash
npm test                                         # planner, parser, email and study logic
npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml  # native side (email parsing)
```

| Path | What's there |
| --- | --- |
| `src/lib/parse.ts` | Brain-dump parser: times, durations, deadlines, categories |
| `src/lib/schedule.ts` | The self-healing day planner |
| `src/lib/mail.ts` | Signal/noise and email → task suggestions, reply drafts |
| `src/lib/study.ts` | Flashcards from notes, spaced repetition, study pacing |
| `src/lib/notes.ts` | `[ ]` and `/task` lines in notes → tasks |
| `src/lib/ics.ts` | Calendar (.ics) reader: time zones, repeating events, exceptions |
| `src/lib/courses.ts` | Course feeds: splits classes from assignment deadlines and keeps those tasks in sync |
| `src/lib/caldav.ts` | CalDAV client (Apple iCloud, Fastmail, Nextcloud) |
| `src/views/calendar/` | Day, week and month calendar |
| `src/tray.tsx` | The tray panel |
| `src/lib/triage.ts` | The unified Signal/Noise inbox |
| `src/lib/availability.ts` | "Copy my free time" |
| `src/lib/taskViews.ts` | Task views, filters and grouping |
| `src/views/`, `src/components/` | The interface (React) |
| `src/notice.tsx` | The reminder card window |
| `src-tauri/src/` | Native shell (Tauri/Rust): windows, tray, global shortcut, storage, IMAP |

Built with [Tauri 2](https://tauri.app), React and TypeScript.

## Credits

The way Tally works (the unified Signal/Noise inbox, Tasks list and board, keyboard navigation, create launcher, tags and snippets) was inspired by [Macro](https://github.com/macro-inc/macro), an open-source team workspace. Tally is an independent implementation for one person, running on their own computer. It contains no code from Macro.
