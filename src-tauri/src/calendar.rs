//! Subscribed calendars: Kindred downloads the calendar's private iCal link
//! straight from Google, iCloud or Outlook. No account sign-in, no middleman.

use std::io::Read;
use std::time::Duration;

const MAX_BYTES: u64 = 20 * 1024 * 1024;

fn normalize(url: &str) -> Result<String, String> {
    let url = url.trim();
    let url = if let Some(rest) = url.strip_prefix("webcal://") { format!("https://{rest}") } else { url.to_string() };
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("That doesn't look like a calendar link. It should start with https:// or webcal://".into());
    }
    Ok(url)
}

#[tauri::command]
pub async fn calendar_fetch(url: String) -> Result<String, String> {
    let url = normalize(&url)?;
    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(30)).user_agent("Kindred calendar").build();
        let res = agent.get(&url).call().map_err(|e| match e {
            ureq::Error::Status(404, _) => "The calendar link wasn't found. Copy it again from your calendar's settings.".to_string(),
            ureq::Error::Status(code, _) => format!("The calendar server answered with an error ({code})."),
            other => format!("Couldn't reach the calendar: {other}"),
        })?;
        let mut body = String::new();
        res.into_reader().take(MAX_BYTES).read_to_string(&mut body).map_err(|e| e.to_string())?;
        if !body.contains("BEGIN:VCALENDAR") {
            return Err("That link didn't return a calendar. Use the iCal (.ics) address.".into());
        }
        Ok(body)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::normalize;

    #[test]
    fn accepts_webcal_and_https_links() {
        assert_eq!(normalize(" webcal://p01-caldav.icloud.com/x.ics ").unwrap(), "https://p01-caldav.icloud.com/x.ics");
        assert!(normalize("https://calendar.google.com/calendar/ical/x/basic.ics").is_ok());
        assert!(normalize("file:///etc/passwd").is_err());
    }
}
