//! The whole plan lives in one JSON file in the OS app-data folder
//! (~/Library/Application Support/app.kindred.desktop on macOS,
//! %APPDATA%\app.kindred.desktop on Windows). Nothing leaves the machine.

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

const FILE: &str = "kindred-data.json";
pub const STATE_EVENT: &str = "kindred://state";

#[derive(Default)]
pub struct Store {
    // Serializes writes from the main window and the Now Bar.
    lock: Mutex<()>,
}

#[derive(Clone, Serialize)]
struct StatePayload {
    origin: String,
    data: String,
}

fn data_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(FILE))
}

#[tauri::command]
pub fn load_state(app: AppHandle, store: State<'_, Store>) -> Result<Option<String>, String> {
    let _guard = store.lock.lock().map_err(|e| e.to_string())?;
    let path = data_file(&app)?;
    match fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn save_state(app: AppHandle, store: State<'_, Store>, data: String, origin: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&data).map_err(|e| format!("refusing to save invalid data: {e}"))?;
    {
        let _guard = store.lock.lock().map_err(|e| e.to_string())?;
        let path = data_file(&app)?;
        // Write to a temp file first so a crash mid-write never corrupts the plan.
        let tmp = path.with_extension("json.tmp");
        let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    }
    app.emit(STATE_EVENT, StatePayload { origin, data }).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn erase_state(app: AppHandle, store: State<'_, Store>) -> Result<(), String> {
    let _guard = store.lock.lock().map_err(|e| e.to_string())?;
    let path = data_file(&app)?;
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn data_location(app: AppHandle) -> Result<String, String> {
    Ok(data_file(&app)?.display().to_string())
}
