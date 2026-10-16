mod caldav;
mod calendar;
mod mail;
mod storage;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Rect, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const QUICK_CAPTURE: &str = "CommandOrControl+Shift+Space";
const CAPTURE_EVENT: &str = "kindred://quick-capture";
const NOTICE_EVENT: &str = "kindred://notice";
const NAVIGATE_EVENT: &str = "kindred://navigate";
/// Gap between the tray icon and the tray panel, in logical pixels.
const TRAY_GAP: f64 = 8.0;
/// Gap between the notification card and the screen corner, in logical pixels.
const NOTICE_MARGIN: f64 = 12.0;
/// Gap between the Now Bar and the bottom of the screen, in logical pixels.
const NOWBAR_MARGIN: f64 = 28.0;

fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Park the Now Bar at the bottom centre of the screen, above the Dock or taskbar.
fn place_nowbar(app: &AppHandle) {
    let Some(bar) = app.get_webview_window("nowbar") else { return };
    let Ok(Some(monitor)) = bar.primary_monitor() else { return };
    let Ok(size) = bar.outer_size() else { return };
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let x = area.position.x + (area.size.width as i32 - size.width as i32) / 2;
    let y = area.position.y + area.size.height as i32 - size.height as i32 - (NOWBAR_MARGIN * scale) as i32;
    let _ = bar.set_position(PhysicalPosition::new(x, y));
}

/// Kindred's own notification card, top-right, above every app. It never steals focus.
#[tauri::command]
fn show_notice(app: AppHandle, notice: serde_json::Value) -> Result<(), String> {
    let card = app.get_webview_window("notice").ok_or("notice window is missing")?;
    if let (Ok(Some(monitor)), Ok(size)) = (card.primary_monitor(), card.outer_size()) {
        let area = monitor.work_area();
        let margin = (NOTICE_MARGIN * monitor.scale_factor()) as i32;
        let x = area.position.x + area.size.width as i32 - size.width as i32 - margin;
        let y = area.position.y + margin;
        let _ = card.set_position(PhysicalPosition::new(x, y));
    }
    card.show().map_err(|e| e.to_string())?;
    app.emit_to("notice", NOTICE_EVENT, notice).map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_notice(app: AppHandle) -> Result<(), String> {
    match app.get_webview_window("notice") {
        Some(card) => card.hide().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

/// Drop the tray panel down from the menu bar (macOS) or up from the taskbar (Windows).
fn toggle_tray_panel(app: &AppHandle, rect: Rect) {
    let Some(panel) = app.get_webview_window("tray") else { return };
    if panel.is_visible().unwrap_or(false) {
        let _ = panel.hide();
        return;
    }
    let scale = panel.scale_factor().unwrap_or(1.0);
    let icon_pos = rect.position.to_physical::<f64>(scale);
    let icon_size = rect.size.to_physical::<f64>(scale);
    if let Ok(size) = panel.outer_size() {
        let (w, h) = (size.width as f64, size.height as f64);
        let gap = TRAY_GAP * scale;
        let monitor = panel
            .available_monitors()
            .ok()
            .and_then(|ms| {
                ms.into_iter().find(|m| {
                    let p = m.position();
                    let s = m.size();
                    icon_pos.x >= p.x as f64 && icon_pos.x < (p.x + s.width as i32) as f64 && icon_pos.y >= p.y as f64 && icon_pos.y < (p.y + s.height as i32) as f64
                })
            })
            .or_else(|| panel.primary_monitor().ok().flatten());
        let mut x = icon_pos.x + icon_size.width / 2.0 - w / 2.0;
        let mut y = icon_pos.y + icon_size.height + gap;
        if let Some(m) = monitor {
            let area = m.work_area();
            let (left, top) = (area.position.x as f64, area.position.y as f64);
            let (right, bottom) = (left + area.size.width as f64, top + area.size.height as f64);
            // Taskbar at the bottom (Windows): open upwards instead.
            if icon_pos.y > top + (bottom - top) / 2.0 {
                y = icon_pos.y - h - gap;
            }
            x = x.clamp(left + gap, right - w - gap);
            y = y.clamp(top + gap, bottom - h - gap);
        }
        let _ = panel.set_position(PhysicalPosition::new(x as i32, y as i32));
    }
    let _ = panel.show();
    let _ = panel.set_focus();
}

/// Open the main window on a page (from the tray panel).
#[tauri::command]
fn open_view(app: AppHandle, view: String) {
    if let Some(panel) = app.get_webview_window("tray") {
        let _ = panel.hide();
    }
    show_main_window(&app);
    let _ = app.emit_to("main", NAVIGATE_EVENT, view);
}

#[tauri::command]
fn hide_tray(app: AppHandle) {
    if let Some(panel) = app.get_webview_window("tray") {
        let _ = panel.hide();
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn show_main(app: AppHandle) {
    show_main_window(&app);
}

#[tauri::command]
fn set_nowbar_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    let bar = app.get_webview_window("nowbar").ok_or("Now Bar window is missing")?;
    if visible {
        if !bar.is_visible().unwrap_or(false) {
            place_nowbar(&app);
        }
        bar.show().map_err(|e| e.to_string())
    } else {
        bar.hide().map_err(|e| e.to_string())
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Kindred", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", "Quick capture", true, Some(QUICK_CAPTURE))?;
    let nowbar = MenuItem::with_id(app, "nowbar", "Show or hide the Now Bar", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Kindred", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &capture, &nowbar, &sep, &quit])?;

    let mut tray = TrayIconBuilder::with_id("kindred")
        .tooltip("Kindred")
        .menu(&menu)
        // Left click opens the visual panel; right click shows the menu.
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, rect, .. } = event {
                toggle_tray_panel(tray.app_handle(), rect);
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
        "open" => show_main_window(app),
        "capture" => {
            show_main_window(app);
            let _ = app.emit(CAPTURE_EVENT, ());
        }
        "nowbar" => {
            if let Some(bar) = app.get_webview_window("nowbar") {
                if bar.is_visible().unwrap_or(false) {
                    let _ = bar.hide();
                } else {
                    place_nowbar(app);
                    let _ = bar.show();
                }
            }
        }
        "quit" => app.exit(0),
        _ => {}
    });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main_window(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        show_main_window(app);
                        let _ = app.emit(CAPTURE_EVENT, ());
                    }
                })
                .build(),
        )
        .manage(storage::Store::default())
        .invoke_handler(tauri::generate_handler![
            storage::load_state,
            storage::save_state,
            storage::erase_state,
            storage::data_location,
            storage::save_backup,
            mail::mail_connect,
            mail::mail_fetch,
            mail::mail_forget,
            calendar::calendar_fetch,
            caldav::caldav_connect,
            caldav::caldav_request,
            caldav::caldav_forget,
            show_main,
            set_nowbar_visible,
            show_notice,
            hide_notice,
            open_view,
            hide_tray,
            quit_app,
        ])
        .setup(|app| {
            let handle = app.handle();
            build_tray(handle)?;
            // Another app may already own the shortcut; Kindred still works without it.
            if let Err(e) = handle.global_shortcut().register(QUICK_CAPTURE) {
                eprintln!("quick capture shortcut unavailable: {e}");
            }
            place_nowbar(handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the main window keeps Kindred running in the tray, like a menu bar app.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            // The tray panel behaves like a menu: click anywhere else and it goes away.
            if let WindowEvent::Focused(false) = event {
                if window.label() == "tray" {
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Kindred");

    app.run(|app, event| {
        // macOS: clicking the Dock icon brings the window back.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            show_main_window(app);
        }
        let _ = (app, &event);
    });
}
