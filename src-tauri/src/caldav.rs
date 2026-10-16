//! CalDAV: the open protocol behind Apple Calendar (iCloud), Fastmail,
//! Nextcloud and others. Kindred only sends PROPFIND/REPORT reads, only to the
//! provider the user signed in to, and keeps the app password in the OS keychain.

use std::io::Read;
use std::time::Duration;

use base64::Engine;
use serde::Serialize;

const KEYCHAIN_SERVICE: &str = "app.kindred.desktop.calendar";
const MAX_BYTES: u64 = 30 * 1024 * 1024;

#[derive(Serialize)]
pub struct DavResponse {
    status: u16,
    body: String,
}

fn entry(account_id: &str, username: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, &format!("{account_id}:{username}")).map_err(|e| e.to_string())
}

fn host_of(url: &str) -> Option<String> {
    let rest = url.strip_prefix("https://")?;
    let host = rest.split(['/', '?', '#']).next()?.split(':').next()?;
    Some(host.to_ascii_lowercase())
}

/// iCloud hands out per-user servers (p42-caldav.icloud.com), so compare the
/// last two labels of the host rather than the whole name.
fn same_site(a: &str, b: &str) -> bool {
    let tail = |h: &str| h.rsplit('.').take(2).collect::<Vec<_>>().join(".");
    match (host_of(a), host_of(b)) {
        (Some(x), Some(y)) => tail(&x) == tail(&y),
        _ => false,
    }
}

fn send(url: &str, method: &str, depth: &str, body: &str, username: &str, password: &str) -> Result<DavResponse, String> {
    if !matches!(method, "PROPFIND" | "REPORT") {
        return Err("only calendar reads are allowed".into());
    }
    if host_of(url).is_none() {
        return Err("calendar servers must use https://".into());
    }
    let auth = base64::engine::general_purpose::STANDARD.encode(format!("{username}:{password}"));
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(40)).redirects(0).user_agent("Kindred calendar").build();
    let result = agent
        .request(method, url)
        .set("Authorization", &format!("Basic {auth}"))
        .set("Depth", depth)
        .set("Content-Type", "application/xml; charset=utf-8")
        .send_string(body);
    let res = match result {
        Ok(r) => r,
        Err(ureq::Error::Status(code, r)) if (300..400).contains(&code) => r,
        Err(ureq::Error::Status(401, _)) | Err(ureq::Error::Status(403, _)) => {
            return Err("login: the calendar server didn't accept that username and app password".into())
        }
        Err(ureq::Error::Status(code, _)) => return Err(format!("The calendar server answered with an error ({code}).")),
        Err(e) => return Err(format!("Couldn't reach the calendar server: {e}")),
    };
    let status = res.status();
    if (300..400).contains(&status) {
        // Hand redirects back so the caller can follow them on the same site.
        return Ok(DavResponse { status, body: res.header("Location").unwrap_or_default().to_string() });
    }
    let mut body = String::new();
    res.into_reader().take(MAX_BYTES).read_to_string(&mut body).map_err(|e| e.to_string())?;
    Ok(DavResponse { status, body })
}

/// Check the sign-in works, then remember the app password in the keychain.
#[tauri::command]
pub async fn caldav_connect(account_id: String, server: String, username: String, password: String, probe: String) -> Result<DavResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let res = send(&server, "PROPFIND", "0", &probe, &username, &password)?;
        entry(&account_id, &username)?.set_password(&password).map_err(|e| format!("keychain: {e}"))?;
        Ok(res)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn caldav_request(account_id: String, server: String, username: String, url: String, method: String, depth: String, body: String) -> Result<DavResponse, String> {
    if !same_site(&server, &url) {
        return Err("refusing to send calendar credentials to a different site".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let password = entry(&account_id, &username)?
            .get_password()
            .map_err(|_| "login: no saved password, please reconnect this calendar".to_string())?;
        send(&url, &method, &depth, &body, &username, &password)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn caldav_forget(account_id: String, username: String) -> Result<(), String> {
    match entry(&account_id, &username)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_talks_to_the_signed_in_provider() {
        assert!(same_site("https://caldav.icloud.com/", "https://p42-caldav.icloud.com/123/calendars/"));
        assert!(!same_site("https://caldav.icloud.com/", "https://evil.example.com/"));
        assert!(!same_site("https://caldav.icloud.com/", "http://p42-caldav.icloud.com/"));
    }

    #[test]
    fn refuses_writes() {
        assert!(send("https://caldav.icloud.com/", "DELETE", "0", "", "u", "p").is_err());
    }
}
