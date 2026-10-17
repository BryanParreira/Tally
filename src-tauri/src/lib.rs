mod caldav;
mod calendar;
mod mail;
mod outlook;
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

fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// macOS: real frosted glass with rounded corners and the system shadow, so a
/// floating window has no square edges or clipped shadow around it.
#[cfg(target_os = "macos")]
fn glass(window: &tauri::WebviewWindow, effect: tauri::window::Effect, radius: f64) {
    use tauri::window::{EffectState, EffectsBuilder};
    let _ = window.set_effects(EffectsBuilder::new().effect(effect).state(EffectState::Active).radius(radius).build());
    let _ = window.set_shadow(true);
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

/// Follow Kindred's own light/dark choice in the native parts of every window:
/// title bar, frosted panels and form controls. The main window's background
/// matches the page so resizing never shows a white edge.
#[tauri::command]
fn set_native_theme(app: AppHandle, theme: String, dark: bool) {
    let native = match theme.as_str() {
        "dark" => Some(tauri::Theme::Dark),
        "light" => Some(tauri::Theme::Light),
        _ => None,
    };
    for window in app.webview_windows().values() {
        let _ = window.set_theme(native);
    }
    if let Some(main) = app.get_webview_window("main") {
        let paper = if dark { tauri::window::Color(25, 25, 25, 255) } else { tauri::window::Color(255, 255, 255, 255) };
        let _ = main.set_background_color(Some(paper));
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Kindred", true, None::<&str>)?;
    let capture = MenuItem::with_id(app, "capture", "Quick capture", true, Some(QUICK_CAPTURE))?;
    let quit = MenuItem::with_id(app, "quit", "Quit Kindred", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &capture, &sep, &quit])?;

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
        "quit" => app.exit(0),
        _ => {}
    });
    // macOS: a template glyph the system tints for light and dark menu bars.
    // Windows: the full-colour app icon, which suits the taskbar.
    #[cfg(target_os = "macos")]
    {
        tray = tray.icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray@2x.png"))?).icon_as_template(true);
    }
    #[cfg(not(target_os = "macos"))]
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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            mail::mail_body,
            outlook::outlook_connect,
            outlook::outlook_fetch,
            outlook::outlook_body,
            outlook::outlook_forget,
            outlook::mail_domain_provider,
            mail::mail_forget,
            calendar::calendar_fetch,
            caldav::caldav_connect,
            caldav::caldav_request,
            caldav::caldav_forget,
            show_main,
            set_native_theme,
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
            #[cfg(target_os = "macos")]
            {
                use tauri::window::Effect;
                if let Some(panel) = handle.get_webview_window("tray") {
                    glass(&panel, Effect::Popover, 16.0);
                }
            }
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
