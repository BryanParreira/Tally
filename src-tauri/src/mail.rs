//! Email over IMAP, straight from this computer to the user's provider.
//! The app password is kept in the OS keychain (Keychain on macOS,
//! Credential Manager on Windows) and never written to Kindred's data file.

use std::net::TcpStream;

use chrono::{Duration, Utc};
use mail_parser::MessageParser;
use serde::{Deserialize, Serialize};

const KEYCHAIN_SERVICE: &str = "app.kindred.desktop.mail";
/// Bigger messages (usually attachments) are read from their headers only.
const MAX_FULL_FETCH: u32 = 1_500_000;
const MAX_TEXT_CHARS: usize = 4000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailAccount {
    pub host: String,
    pub port: u16,
    pub username: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailMessage {
    id: String,
    from_name: String,
    from_address: String,
    subject: String,
    date: i64,
    text: String,
    bulk: bool,
}

fn keychain_entry(account: &MailAccount) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, &format!("{}@{}", account.username, account.host)).map_err(|e| e.to_string())
}

type Session = imap::Session<native_tls::TlsStream<TcpStream>>;

fn login(account: &MailAccount, password: &str) -> Result<Session, String> {
    let tls = native_tls::TlsConnector::builder().build().map_err(|e| e.to_string())?;
    let client = imap::connect((account.host.as_str(), account.port), account.host.as_str(), &tls).map_err(|e| format!("connect: {e}"))?;
    client.login(&account.username, password).map_err(|(e, _)| format!("login: {e}"))
}

/// Check the credentials work, then remember the password in the keychain.
#[tauri::command]
pub async fn mail_connect(account: MailAccount, password: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = login(&account, &password)?;
        let _ = session.logout();
        keychain_entry(&account)?.set_password(&password).map_err(|e| format!("keychain: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn mail_forget(account: MailAccount) -> Result<(), String> {
    match keychain_entry(&account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Fetch recent inbox messages without marking anything as read.
#[tauri::command]
pub async fn mail_fetch(account: MailAccount, days: i64, limit: usize) -> Result<Vec<MailMessage>, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_blocking(&account, days, limit))
        .await
        .map_err(|e| e.to_string())?
}

fn fetch_blocking(account: &MailAccount, days: i64, limit: usize) -> Result<Vec<MailMessage>, String> {
    let password = keychain_entry(account)?
        .get_password()
        .map_err(|_| "login: no saved password, please reconnect your email".to_string())?;
    let mut session = login(account, &password)?;
    session.examine("INBOX").map_err(|e| e.to_string())?;

    let since = (Utc::now() - Duration::days(days.clamp(1, 90))).format("%d-%b-%Y").to_string();
    let mut uids: Vec<u32> = session.uid_search(format!("SINCE {since}")).map_err(|e| e.to_string())?.into_iter().collect();
    uids.sort_unstable_by(|a, b| b.cmp(a));
    uids.truncate(limit.clamp(1, 200));
    if uids.is_empty() {
        let _ = session.logout();
        return Ok(Vec::new());
    }

    let set = |ids: &[u32]| ids.iter().map(u32::to_string).collect::<Vec<_>>().join(",");
    let sizes = session.uid_fetch(set(&uids), "RFC822.SIZE").map_err(|e| e.to_string())?;
    let (mut small, mut large) = (Vec::new(), Vec::new());
    for f in sizes.iter() {
        if let Some(uid) = f.uid {
            if f.size.unwrap_or(0) <= MAX_FULL_FETCH {
                small.push(uid)
            } else {
                large.push(uid)
            }
        }
    }

    let mut out = Vec::new();
    if !small.is_empty() {
        for f in session.uid_fetch(set(&small), "BODY.PEEK[]").map_err(|e| e.to_string())?.iter() {
            if let (Some(uid), Some(raw)) = (f.uid, f.body()) {
                if let Some(m) = parse(account, uid, raw) {
                    out.push(m);
                }
            }
        }
    }
    if !large.is_empty() {
        for f in session.uid_fetch(set(&large), "BODY.PEEK[HEADER]").map_err(|e| e.to_string())?.iter() {
            if let (Some(uid), Some(raw)) = (f.uid, f.header()) {
                if let Some(m) = parse(account, uid, raw) {
                    out.push(m);
                }
            }
        }
    }
    let _ = session.logout();
    out.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(out)
}

fn parse(account: &MailAccount, uid: u32, raw: &[u8]) -> Option<MailMessage> {
    let msg = MessageParser::default().parse(raw)?;
    let from = msg.from().and_then(|a| a.first());
    let bulk = msg.header("List-Unsubscribe").is_some()
        || msg.header("List-Id").is_some()
        || msg
            .header_raw("Precedence")
            .map(|p| matches!(p.trim().to_ascii_lowercase().as_str(), "bulk" | "list" | "junk"))
            .unwrap_or(false);
    let text = msg.body_text(0).map(|t| tidy(&t)).unwrap_or_default();
    Some(MailMessage {
        id: format!("{}:{}", account.username, uid),
        from_name: from.and_then(|a| a.name()).unwrap_or_default().to_string(),
        from_address: from.and_then(|a| a.address()).unwrap_or_default().to_string(),
        subject: msg.subject().unwrap_or_default().to_string(),
        date: msg.date().map(|d| d.to_timestamp() * 1000).unwrap_or_else(|| Utc::now().timestamp_millis()),
        text,
        bulk,
    })
}

/// Drop quoted replies and signatures-in-waiting, collapse blank runs, cap the length.
fn tidy(text: &str) -> String {
    let mut lines = Vec::new();
    for line in text.lines() {
        let l = line.trim_end();
        if l.starts_with('>') {
            continue;
        }
        if l.starts_with("On ") && l.ends_with("wrote:") {
            break;
        }
        if l.is_empty() && lines.last().map(|p: &String| p.is_empty()).unwrap_or(true) {
            continue;
        }
        lines.push(l.to_string());
    }
    let joined = lines.join("\n");
    joined.chars().take(MAX_TEXT_CHARS).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn account() -> MailAccount {
        MailAccount { host: "imap.example.com".into(), port: 993, username: "me@example.com".into() }
    }

    #[test]
    fn parses_a_plain_message() {
        let raw = b"From: Prof. Lee <lee@uni.edu>\r\nSubject: Assignment 3\r\nDate: Fri, 16 Oct 2026 08:12:00 +0000\r\n\r\nPlease submit by Thursday.\r\n\r\n> old quoted text\r\n";
        let m = parse(&account(), 42, raw).unwrap();
        assert_eq!(m.id, "me@example.com:42");
        assert_eq!(m.from_name, "Prof. Lee");
        assert_eq!(m.from_address, "lee@uni.edu");
        assert_eq!(m.subject, "Assignment 3");
        assert!(m.text.contains("Please submit by Thursday."));
        assert!(!m.text.contains("old quoted"));
        assert!(!m.bulk);
    }

    #[test]
    fn flags_newsletters_as_bulk() {
        let raw = b"From: Store <news@store.com>\r\nSubject: Sale\r\nList-Unsubscribe: <mailto:u@store.com>\r\n\r\nBuy now\r\n";
        assert!(parse(&account(), 1, raw).unwrap().bulk);
    }
}
