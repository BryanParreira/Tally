import { useEffect, useState } from "react";
import { isMac, dataLocation, eraseAllData, mailForget, setNowBarVisible, showNotice } from "../lib/native";
import { timeOptions, useToast } from "../lib/hooks";
import { emptyData, useStore } from "../lib/store";
import { Segmented, Switch } from "../components/ui";
import type { Settings } from "../lib/types";

const TIMES = timeOptions(30);

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const name = useStore((s) => s.name);
  const account = useStore((s) => s.mail.account);
  const { updateSettings, setName, setMailAccount, replaceData } = useStore.getState();
  const toast = useToast((s) => s.show);
  const [location, setLocation] = useState("");
  const [confirmErase, setConfirmErase] = useState(false);

  useEffect(() => {
    dataLocation().then(setLocation).catch(() => setLocation("Unknown"));
  }, []);

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1 className="title">Make it yours</h1>
        </div>
      </header>

      <div className="stack" style={{ gap: 16 }}>
        <section className="card settings-section" aria-label="You">
          <div className="setting">
            <div>
              <div className="name">Your name</div>
              <div className="desc">Used in greetings and email replies.</div>
            </div>
            <label htmlFor="set-name" className="sr-only">
              Your name
            </label>
            <input id="set-name" className="input" style={{ width: 220 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
        </section>

        <section className="card settings-section" aria-label="Your day">
          <h2 className="section">Your day</h2>
          <div className="setting">
            <div>
              <div className="name">Day starts and ends</div>
              <div className="desc">Kindred only plans tasks inside these hours.</div>
            </div>
            <div className="row">
              <TimeSelect label="Day starts" value={settings.dayStart} onChange={(v) => updateSettings({ dayStart: Math.min(v, settings.dayEnd - 60) })} />
              <span className="muted">to</span>
              <TimeSelect label="Day ends" value={settings.dayEnd} onChange={(v) => updateSettings({ dayEnd: Math.max(v, settings.dayStart + 60) })} />
            </div>
          </div>
          <div className="setting">
            <div>
              <div className="name">Breaks</div>
              <div className="desc">A short break gets added after this much back-to-back work.</div>
            </div>
            <Segmented
              label="Break rhythm"
              value={String(settings.breakEvery)}
              onChange={(v) => updateSettings({ breakEvery: Number(v) })}
              options={[
                { value: "60", label: "60 min" },
                { value: "90", label: "90 min" },
                { value: "120", label: "2 h" },
                { value: "1440", label: "Off" },
              ]}
            />
          </div>
        </section>

        <section className="card settings-section" aria-label="Appearance">
          <h2 className="section">Appearance</h2>
          <div className="setting">
            <div>
              <div className="name">Theme</div>
            </div>
            <Segmented<Settings["theme"]>
              label="Theme"
              value={settings.theme}
              onChange={(theme) => updateSettings({ theme })}
              options={[
                { value: "system", label: "System" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </div>
          <div className="setting">
            <div>
              <div className="name">Now Bar</div>
              <div className="desc">A small floating bar that shows what to do right now, on top of any app.</div>
            </div>
            <Switch
              label="Show the Now Bar"
              checked={settings.nowBar}
              onChange={(nowBar) => {
                updateSettings({ nowBar });
                setNowBarVisible(nowBar);
              }}
            />
          </div>
          <div className="setting">
            <div>
              <div className="name">Reminders</div>
              <div className="desc">A small Kindred card in the corner of your screen when a task begins or a focus session ends.</div>
            </div>
            <div className="row">
              <button
                type="button"
                className="btn ghost sm"
                onClick={async () => {
                  const shown = await showNotice({
                    id: `preview:${Date.now()}`,
                    kind: "up-next",
                    title: "Study bio chapter 4",
                    body: "Until 11:45 AM · 1 h. Then Lunch.",
                    taskId: "",
                  }).catch(() => false);
                  if (!shown) toast("Reminders appear in the desktop app");
                }}
              >
                Preview
              </button>
              <Switch label="Reminders" checked={settings.reminders} onChange={(reminders) => updateSettings({ reminders })} />
            </div>
          </div>
          <div className="setting">
            <div>
              <div className="name">Quick capture</div>
              <div className="desc">Open Kindred and start typing from anywhere.</div>
            </div>
            <span className="row" style={{ gap: 4 }}>
              <span className="kbd">{isMac ? "⌘" : "Ctrl"}</span>
              <span className="kbd">{isMac ? "⇧" : "Shift"}</span>
              <span className="kbd">Space</span>
            </span>
          </div>
        </section>

        <section className="card settings-section" aria-label="Email">
          <h2 className="section">Email</h2>
          <div className="setting">
            <div>
              <div className="name">{account ? account.username : "Not connected"}</div>
              <div className="desc">{account ? `Signed in through ${account.host}. The app password is in your system keychain.` : "Connect from the Inbox tab."}</div>
            </div>
            {account && (
              <button
                type="button"
                className="btn sm danger"
                onClick={async () => {
                  await mailForget(account).catch(() => undefined);
                  setMailAccount(null);
                  toast("Email disconnected");
                }}
              >
                Disconnect
              </button>
            )}
          </div>
        </section>

        <section className="card settings-section" aria-label="Privacy and data">
          <h2 className="section">Privacy & data</h2>
          <div className="setting">
            <div>
              <div className="name">Everything stays on this computer</div>
              <div className="desc">Kindred has no account, no cloud and no tracking. Your plan is saved here:</div>
              <div className="small" style={{ marginTop: 6, fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", wordBreak: "break-all", userSelect: "text" }}>
                {location}
              </div>
            </div>
          </div>
          <div className="setting">
            <div>
              <div className="name">Erase everything</div>
              <div className="desc">Deletes all tasks, courses, flashcards and email data from this computer.</div>
            </div>
            {confirmErase ? (
              <div className="row">
                <button
                  type="button"
                  className="btn sm danger"
                  onClick={async () => {
                    if (account) await mailForget(account).catch(() => undefined);
                    await eraseAllData();
                    replaceData(emptyData());
                    setConfirmErase(false);
                  }}
                >
                  Yes, erase it all
                </button>
                <button type="button" className="btn ghost sm" onClick={() => setConfirmErase(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" className="btn sm danger" onClick={() => setConfirmErase(true)}>
                Erase…
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function TimeSelect({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <select className="input" style={{ width: 120 }} aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {TIMES.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
