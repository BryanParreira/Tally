//! Outlook.com and Microsoft 365 (school and work) mail through Microsoft Graph.
//!
//! Microsoft no longer accepts passwords or app passwords for these accounts, so
//! Kindred signs in the way desktop apps should: it opens the browser, the person
//! signs in with Microsoft (including their school's MFA), and Microsoft hands a
//! read-only token back to a one-time listener on localhost (OAuth 2.0 with PKCE,
//! no client secret). The refresh token lives in the OS keychain, never in
//! Kindred's data file, and mail goes straight from Microsoft to this computer.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

const KEYCHAIN_SERVICE: &str = "app.kindred.desktop.outlook";
const AUTHORITY: &str = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH: &str = "https://graph.microsoft.com/v1.0";
/// Read-only mail, the account's address, and a refresh token so sign-in lasts.
const SCOPES: &str = "offline_access User.Read Mail.Read";
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);
const MAX_TEXT_CHARS: usize = 4000;

/// The app's Microsoft registration (see the README). Set at run time with
/// `KINDRED_MS_CLIENT_ID`, or baked in at build time with the same variable.
fn client_id() -> Result<String, String> {
    std::env::var("KINDRED_MS_CLIENT_ID")
        .ok()
        .or_else(|| option_env!("KINDRED_MS_CLIENT_ID").map(str::to_string))
        .filter(|id| !id.trim().is_empty())
        .ok_or_else(|| "setup: Microsoft sign-in isn't set up in this build of Kindred yet.".to_string())
}

fn keychain(username: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, username).map_err(|e| e.to_string())
}

fn random_token(bytes: usize) -> Result<String, String> {
    let mut buf = vec![0u8; bytes];
    getrandom::getrandom(&mut buf).map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(buf))
}

fn challenge(verifier: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
}

#[derive(Deserialize)]
struct TokenError {
    error: String,
    error_description: Option<String>,
}

/// Turn Microsoft's error codes into something a student can act on.
fn friendly(error: &str, description: &str) -> String {
    if description.contains("AADSTS65001") || description.contains("AADSTS90094") || description.contains("admin") {
        return "admin: Your school needs to approve Kindred before you can sign in. Ask your IT help desk to allow it.".into();
    }
    if error == "access_denied" {
        return "cancelled: Sign-in was cancelled.".into();
    }
    if error == "invalid_grant" {
        return "login: Your Microsoft sign-in expired. Reconnect this inbox.".into();
    }
    format!("{error}: {description}")
}

/// Read a JSON response body.
fn json<T: for<'de> Deserialize<'de>>(resp: ureq::Response) -> Result<T, String> {
    let text = resp.into_string().map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

fn token_request(form: &[(&str, &str)]) -> Result<TokenResponse, String> {
    match ureq::post(&format!("{AUTHORITY}/token")).send_form(form) {
        Ok(resp) => json::<TokenResponse>(resp),
        Err(ureq::Error::Status(_, resp)) => {
            let err = json::<TokenError>(resp)?;
            Err(friendly(&err.error, err.error_description.as_deref().unwrap_or("")))
        }
        Err(e) => Err(format!("connect: {e}")),
    }
}

/// Wait for Microsoft to send the browser back to us with the sign-in code.
fn wait_for_code(listener: TcpListener, state: &str) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let started = Instant::now();
    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream.set_nonblocking(false).map_err(|e| e.to_string())?;
                let mut first = String::new();
                BufReader::new(&stream).read_line(&mut first).map_err(|e| e.to_string())?;
                let path = first.split_whitespace().nth(1).unwrap_or("/");
                let url = url::Url::parse(&format!("http://localhost{path}")).map_err(|e| e.to_string())?;
                let get = |k: &str| url.query_pairs().find(|(key, _)| key == k).map(|(_, v)| v.into_owned());
                // Browsers also ask for /favicon.ico; ignore anything without our state.
                if get("state").as_deref() != Some(state) {
                    let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                    continue;
                }
                let ok = get("code").is_some();
                let page = if ok {
                    "<h2 style='font-family:-apple-system,sans-serif'>You're signed in.</h2><p style='font-family:-apple-system,sans-serif'>You can close this tab and go back to Kindred.</p>"
                } else {
                    "<h2 style='font-family:-apple-system,sans-serif'>Sign-in didn't finish.</h2><p style='font-family:-apple-system,sans-serif'>Go back to Kindred and try again.</p>"
                };
                let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{page}", page.len());
                return match get("code") {
                    Some(code) => Ok(code),
                    None => Err(friendly(&get("error").unwrap_or_default(), &get("error_description").unwrap_or_default())),
                };
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if started.elapsed() > SIGN_IN_TIMEOUT {
                    return Err("cancelled: Sign-in timed out. Try again when you're ready.".into());
                }
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

#[derive(Deserialize)]
struct DnsAnswer {
    #[serde(rename = "Answer")]
    answer: Option<Vec<DnsRecord>>,
}

#[derive(Deserialize)]
struct DnsRecord {
    data: String,
}

/// Which provider a mail server name belongs to, matching Kindred's provider ids.
fn provider_for_mx(host: &str) -> Option<&'static str> {
    let h = host.trim_end_matches('.').to_ascii_lowercase();
    if h.ends_with("protection.outlook.com") {
        Some("outlook")
    } else if h.ends_with("google.com") || h.ends_with("googlemail.com") {
        Some("gmail")
    } else if h.ends_with("mail.icloud.com") {
        Some("icloud")
    } else if h.ends_with("yahoodns.net") {
        Some("yahoo")
    } else if h.ends_with("messagingengine.com") {
        Some("fastmail")
    } else {
        None
    }
}

/// Where an email domain's mail is hosted, from its MX records, so a student who
/// types `@mnsu.edu` is pointed to Microsoft sign-in. Only the domain is looked up
/// (DNS over HTTPS), never the address.
#[tauri::command]
pub async fn mail_domain_provider(domain: String) -> Option<String> {
    let domain = domain.trim().trim_start_matches('@').to_ascii_lowercase();
    if domain.is_empty() || !domain.contains('.') || !domain.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
        return None;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let resp = ureq::get(&format!("https://cloudflare-dns.com/dns-query?name={domain}&type=MX"))
            .set("accept", "application/dns-json")
            .timeout(Duration::from_secs(4))
            .call()
            .ok()?;
        let answer: DnsAnswer = json(resp).ok()?;
        // "10 mnsu-edu.mail.protection.outlook.com."
        answer.answer?.iter().find_map(|r| r.data.split_whitespace().last().and_then(provider_for_mx)).map(str::to_string)
    })
    .await
    .ok()
    .flatten()
}

#[derive(Serialize)]
pub struct OutlookAccount {
    email: String,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Me {
    mail: Option<String>,
    user_principal_name: Option<String>,
    display_name: Option<String>,
}

/// Open the browser, let the person sign in with Microsoft, and keep the token.
#[tauri::command]
pub async fn outlook_connect(app: AppHandle) -> Result<OutlookAccount, String> {
    let client = client_id()?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let redirect = format!("http://localhost:{}", listener.local_addr().map_err(|e| e.to_string())?.port());
    let verifier = random_token(48)?;
    let state = random_token(16)?;
    let mut auth = url::Url::parse(&format!("{AUTHORITY}/authorize")).map_err(|e| e.to_string())?;
    auth.query_pairs_mut()
        .append_pair("client_id", &client)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", &redirect)
        .append_pair("response_mode", "query")
        .append_pair("scope", SCOPES)
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge(&verifier))
        .append_pair("code_challenge_method", "S256")
        .append_pair("prompt", "select_account");
    app.opener().open_url(auth.as_str(), None::<&str>).map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        let code = wait_for_code(listener, &state)?;
        let tokens = token_request(&[
            ("client_id", &client),
            ("grant_type", "authorization_code"),
            ("code", &code),
            ("redirect_uri", &redirect),
            ("code_verifier", &verifier),
            ("scope", SCOPES),
        ])?;
        let me: Me = graph_get(&tokens.access_token, &format!("{GRAPH}/me?$select=mail,userPrincipalName,displayName"))?;
        let email = me.mail.or(me.user_principal_name).ok_or("login: Microsoft didn't share an email address for this account.")?;
        let refresh = tokens.refresh_token.ok_or("login: Microsoft didn't allow staying signed in.")?;
        keychain(&email)?.set_password(&refresh).map_err(|e| format!("keychain: {e}"))?;
        Ok(OutlookAccount { email, name: me.display_name.unwrap_or_default() })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn outlook_forget(username: String) -> Result<(), String> {
    match keychain(&username)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// A fresh access token from the saved refresh token (Microsoft may rotate it).
fn access_token(username: &str) -> Result<String, String> {
    let entry = keychain(username)?;
    let refresh = entry.get_password().map_err(|_| "login: no saved password, please reconnect your email".to_string())?;
    let client = client_id()?;
    let tokens = token_request(&[("client_id", &client), ("grant_type", "refresh_token"), ("refresh_token", &refresh), ("scope", SCOPES)])?;
    if let Some(next) = tokens.refresh_token.filter(|t| t != &refresh) {
        let _ = entry.set_password(&next);
    }
    Ok(tokens.access_token)
}

fn graph_get<T: for<'de> Deserialize<'de>>(token: &str, url: &str) -> Result<T, String> {
    ureq::get(url)
        .set("Authorization", &format!("Bearer {token}"))
        .set("Prefer", "outlook.body-content-type=\"text\"")
        .call()
        .map_err(|e| match e {
            ureq::Error::Status(401, _) | ureq::Error::Status(403, _) => "login: Microsoft refused access. Reconnect this inbox.".to_string(),
            other => format!("connect: {other}"),
        })
        .and_then(json::<T>)
}

#[derive(Deserialize)]
struct Page {
    value: Vec<GraphMessage>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphMessage {
    id: String,
    subject: Option<String>,
    received_date_time: Option<String>,
    from: Option<Recipient>,
    body: Option<Body>,
    body_preview: Option<String>,
    internet_message_headers: Option<Vec<Header>>,
    inference_classification: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Recipient {
    email_address: Address,
}

#[derive(Deserialize)]
struct Address {
    name: Option<String>,
    address: Option<String>,
}

#[derive(Deserialize)]
struct Body {
    content: Option<String>,
}

#[derive(Deserialize)]
struct Header {
    name: String,
    value: String,
}

/// The same shape as an IMAP message, so the rest of Kindred treats every inbox alike.
#[derive(Serialize)]
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

/// Recent inbox mail, newest first, without marking anything as read.
#[tauri::command]
pub async fn outlook_fetch(username: String, days: i64, limit: usize) -> Result<Vec<MailMessage>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let token = access_token(&username)?;
        let since = (chrono::Utc::now() - chrono::Duration::days(days.clamp(1, 90))).format("%Y-%m-%dT%H:%M:%SZ");
        let mut url = url::Url::parse(&format!("{GRAPH}/me/mailFolders/inbox/messages")).map_err(|e| e.to_string())?;
        url.query_pairs_mut()
            .append_pair("$top", &limit.clamp(1, 100).to_string())
            .append_pair("$filter", &format!("receivedDateTime ge {since}"))
            .append_pair("$orderby", "receivedDateTime desc")
            .append_pair("$select", "id,subject,from,receivedDateTime,body,bodyPreview,internetMessageHeaders,inferenceClassification");
        let page: Page = graph_get(&token, url.as_str())?;
        Ok(page.value.into_iter().map(|m| to_message(&username, m)).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn to_message(username: &str, m: GraphMessage) -> MailMessage {
    let headers = m.internet_message_headers.unwrap_or_default();
    let has = |name: &str| headers.iter().any(|h| h.name.eq_ignore_ascii_case(name));
    let bulk_precedence = headers
        .iter()
        .any(|h| h.name.eq_ignore_ascii_case("Precedence") && matches!(h.value.trim().to_ascii_lowercase().as_str(), "bulk" | "list" | "junk"));
    // Outlook's own "Other" (not Focused) sorting is a good hint that mail can wait.
    let other = m.inference_classification.as_deref() == Some("other");
    let text = m.body.and_then(|b| b.content).or(m.body_preview).unwrap_or_default();
    let (from_name, from_address) = m
        .from
        .map(|f| (f.email_address.name.unwrap_or_default(), f.email_address.address.unwrap_or_default()))
        .unwrap_or_default();
    MailMessage {
        id: format!("{username}:outlook:{}", m.id),
        from_name,
        from_address,
        subject: m.subject.unwrap_or_default(),
        date: m
            .received_date_time
            .and_then(|d| chrono::DateTime::parse_from_rfc3339(&d).ok())
            .map(|d| d.timestamp_millis())
            .unwrap_or_else(|| chrono::Utc::now().timestamp_millis()),
        text: crate::mail::tidy(&text).chars().take(MAX_TEXT_CHARS).collect(),
        bulk: has("List-Unsubscribe") || has("List-Id") || bulk_precedence || other,
    }
}

#[derive(Deserialize)]
struct HtmlBody {
    body: Option<Body>,
}

/// The original HTML of one message, for the reading pane.
#[tauri::command]
pub async fn outlook_body(username: String, id: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let graph_id = id.rsplit_once(":outlook:").map(|(_, g)| g.to_string()).ok_or("unknown message")?;
        let token = access_token(&username)?;
        let url = format!("{GRAPH}/me/messages/{}?$select=body", url::form_urlencoded::byte_serialize(graph_id.as_bytes()).collect::<String>());
        let resp = ureq::get(&url)
            .set("Authorization", &format!("Bearer {token}"))
            .set("Prefer", "outlook.body-content-type=\"html\"")
            .call()
            .map_err(|e| format!("connect: {e}"))?;
        let body: HtmlBody = json(resp)?;
        Ok(body.body.and_then(|b| b.content))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_matches_the_rfc_example() {
        // RFC 7636, appendix B.
        assert_eq!(challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn mail_servers_map_to_providers() {
        assert_eq!(provider_for_mx("mnsu-edu.mail.protection.outlook.com."), Some("outlook"));
        assert_eq!(provider_for_mx("alt1.gmail-smtp-in.l.google.com."), Some("gmail"));
        assert_eq!(provider_for_mx("mta-p11.oit.umn.edu."), None);
    }

    #[test]
    fn school_approval_errors_read_plainly() {
        assert!(friendly("invalid_client", "AADSTS65001: The user or administrator has not consented").starts_with("admin:"));
        assert!(friendly("access_denied", "").starts_with("cancelled:"));
    }

    #[test]
    fn reads_a_real_graph_inbox_page() {
        // Shape of GET /me/mailFolders/inbox/messages with our $select.
        let json = r#"{
          "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#users('me')/mailFolders('inbox')/messages",
          "value": [{
            "@odata.etag": "W/\"CQAAABYAAAA\"",
            "id": "AAMkAGI2TG93AAA=",
            "subject": "Lab report due Friday",
            "receivedDateTime": "2026-10-16T13:05:00Z",
            "bodyPreview": "Please submit…",
            "inferenceClassification": "focused",
            "body": { "contentType": "text", "content": "Please submit the lab report by Friday.\r\n\r\n> quoted" },
            "from": { "emailAddress": { "name": "Prof. Lee", "address": "lee@mnsu.edu" } },
            "internetMessageHeaders": [{ "name": "Received", "value": "from x" }]
          }],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skip=60"
        }"#;
        let page: Page = serde_json::from_str(json).unwrap();
        let m = to_message("me@mnsu.edu", page.value.into_iter().next().unwrap());
        assert_eq!(m.from_name, "Prof. Lee");
        assert_eq!(m.from_address, "lee@mnsu.edu");
        assert_eq!(m.subject, "Lab report due Friday");
        assert_eq!(m.text, "Please submit the lab report by Friday.");
        assert!(!m.bulk);
    }

    #[test]
    fn newsletters_and_other_mail_count_as_bulk() {
        let m = GraphMessage {
            id: "AAMk=".into(),
            subject: Some("Sale".into()),
            received_date_time: Some("2026-10-16T08:00:00Z".into()),
            from: None,
            body: Some(Body { content: Some("Buy now".into()) }),
            body_preview: None,
            internet_message_headers: Some(vec![Header { name: "List-Unsubscribe".into(), value: "<mailto:x>".into() }]),
            inference_classification: Some("focused".into()),
        };
        let out = to_message("me@minnstate.edu", m);
        assert!(out.bulk);
        assert_eq!(out.id, "me@minnstate.edu:outlook:AAMk=");
        assert_eq!(out.date, 1792137600000);
    }
}
