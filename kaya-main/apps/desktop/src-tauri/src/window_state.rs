//! Monitor-aware window state management.
//!
//! This module saves and restores window position/size per monitor,
//! using a fingerprint based on monitor dimensions. This ensures that
//! switching between monitors (e.g., laptop screen vs external display)
//! restores appropriate window sizes for each.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow, Window};

/// Window state for a specific position and size
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

/// Collection of window states keyed by monitor fingerprint
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MonitorWindowStates {
    /// Map of monitor fingerprint -> window state
    pub states: HashMap<String, WindowState>,
    /// Fallback state when no monitor-specific state exists
    pub default_state: Option<WindowState>,
}

impl MonitorWindowStates {
    /// Load states from the config file
    pub fn load(app: &AppHandle) -> Self {
        let path = Self::config_path(app);
        if let Ok(contents) = fs::read_to_string(&path) {
            serde_json::from_str(&contents).unwrap_or_default()
        } else {
            Self::default()
        }
    }

    /// Save states to the config file
    pub fn save(&self, app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
        let path = Self::config_path(app);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let contents = serde_json::to_string_pretty(self)?;
        fs::write(path, contents)?;
        Ok(())
    }

    /// Get the config file path
    fn config_path(app: &AppHandle) -> PathBuf {
        app.path()
            .app_config_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("window-states.json")
    }

    /// Get state for a specific monitor fingerprint
    pub fn get_for_monitor(&self, fingerprint: &str) -> Option<&WindowState> {
        self.states
            .get(fingerprint)
            .or(self.default_state.as_ref())
    }

    /// Set state for a specific monitor fingerprint
    pub fn set_for_monitor(&mut self, fingerprint: String, state: WindowState) {
        // Also update default state
        self.default_state = Some(state.clone());
        self.states.insert(fingerprint, state);
    }
}

/// Generate a fingerprint for a monitor based on its dimensions.
/// Format: "WxH" (e.g., "2560x1440" or "1920x1080")
///
/// For multi-monitor setups with identical monitors, we include
/// the monitor's position to differentiate them.
pub fn monitor_fingerprint(monitor: &Monitor, all_monitors: &[Monitor]) -> String {
    let size = monitor.size();
    let pos = monitor.position();

    // Check if there are other monitors with the same dimensions
    let same_size_count = all_monitors
        .iter()
        .filter(|m| m.size().width == size.width && m.size().height == size.height)
        .count();

    if same_size_count > 1 {
        // Include position for disambiguation
        format!("{}x{}@{},{}", size.width, size.height, pos.x, pos.y)
    } else {
        format!("{}x{}", size.width, size.height)
    }
}

/// Save the current window state for the current monitor (for Window)
pub fn save_window_state_from_window(window: &Window, app: &AppHandle) {
    save_window_state_impl(
        || window.available_monitors(),
        || window.outer_position(),
        || window.outer_size(),
        || window.is_maximized(),
        app,
    );
}

/// Internal implementation for saving window state
fn save_window_state_impl<F1, F2, F3, F4>(
    get_monitors: F1,
    get_position: F2,
    get_size: F3,
    get_maximized: F4,
    app: &AppHandle,
) where
    F1: FnOnce() -> Result<Vec<Monitor>, tauri::Error>,
    F2: FnOnce() -> Result<PhysicalPosition<i32>, tauri::Error>,
    F3: FnOnce() -> Result<PhysicalSize<u32>, tauri::Error>,
    F4: FnOnce() -> Result<bool, tauri::Error>,
{
    let monitors = match get_monitors() {
        Ok(m) => m,
        Err(_) => return,
    };

    if monitors.is_empty() {
        return;
    }

    let pos = match get_position() {
        Ok(p) => p,
        Err(_) => return,
    };
    let size = match get_size() {
        Ok(s) => s,
        Err(_) => return,
    };
    let maximized = get_maximized().unwrap_or(false);

    // Find current monitor based on window center
    let win_center_x = pos.x + (size.width as i32) / 2;
    let win_center_y = pos.y + (size.height as i32) / 2;

    let current_monitor = monitors.iter().find(|mon| {
        let m_pos = mon.position();
        let m_size = mon.size();
        win_center_x >= m_pos.x
            && win_center_x < m_pos.x + m_size.width as i32
            && win_center_y >= m_pos.y
            && win_center_y < m_pos.y + m_size.height as i32
    });

    let target_monitor = current_monitor.unwrap_or(&monitors[0]);
    let fingerprint = monitor_fingerprint(target_monitor, &monitors);

    let state = WindowState {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        maximized,
    };

    // Load, update, and save
    let mut states = MonitorWindowStates::load(app);
    states.set_for_monitor(fingerprint, state);
    let _ = states.save(app);
}

/// Restore window state for the current monitor, with fallback logic
pub fn restore_window_state(window: &WebviewWindow, app: &AppHandle) {
    let monitors: Vec<Monitor> = match window.available_monitors() {
        Ok(m) => m,
        Err(_) => return,
    };

    if monitors.is_empty() {
        return;
    }

    // Get primary or first monitor
    let primary = window.primary_monitor().ok().flatten();
    let target_monitor = primary.as_ref().unwrap_or(&monitors[0]);
    let fingerprint = monitor_fingerprint(target_monitor, &monitors);

    let mon_pos = target_monitor.position();
    let mon_size = target_monitor.size();

    // Load states
    let states = MonitorWindowStates::load(app);

    if let Some(state) = states.get_for_monitor(&fingerprint) {
        // We have a saved state for this monitor
        // Validate it still fits (in case monitor resolution changed)
        let margin = 50;
        let max_width = (mon_size.width as i32 - margin * 2).max(800) as u32;
        let max_height = (mon_size.height as i32 - margin * 2).max(600) as u32;

        let width = state.width.min(max_width).max(1000);
        let height = state.height.min(max_height).max(700);

        // Check if position is valid for this monitor
        let x_valid = state.x >= mon_pos.x
            && state.x + width as i32 <= mon_pos.x + mon_size.width as i32;
        let y_valid = state.y >= mon_pos.y
            && state.y + height as i32 <= mon_pos.y + mon_size.height as i32;

        if x_valid && y_valid && width == state.width && height == state.height {
            // Position and size are valid, restore exactly
            let _ = window.set_size(tauri::Size::Physical(PhysicalSize { width, height }));
            let _ = window.set_position(tauri::Position::Physical(PhysicalPosition {
                x: state.x,
                y: state.y,
            }));
        } else {
            // Size needs adjustment or position is invalid
            let _ = window.set_size(tauri::Size::Physical(PhysicalSize { width, height }));
            // Center on monitor
            let new_x = mon_pos.x + (mon_size.width as i32 - width as i32) / 2;
            let new_y = mon_pos.y + (mon_size.height as i32 - height as i32) / 2;
            let _ = window.set_position(tauri::Position::Physical(PhysicalPosition {
                x: new_x,
                y: new_y,
            }));
        }

        if state.maximized {
            let _ = window.maximize();
        }
    } else {
        // No saved state for this monitor - check if window fits
        ensure_window_fits(window, target_monitor);
    }
}

/// Ensure window fits within the given monitor
fn ensure_window_fits(window: &WebviewWindow, monitor: &Monitor) {
    let win_size = match window.outer_size() {
        Ok(s) => s,
        Err(_) => return,
    };

    let mon_pos = monitor.position();
    let mon_size = monitor.size();

    let margin = 50;
    let max_width = (mon_size.width as i32 - margin * 2).max(800) as u32;
    let max_height = (mon_size.height as i32 - margin * 2).max(600) as u32;

    if win_size.width > max_width || win_size.height > max_height {
        let new_width = win_size.width.min(max_width).max(1000);
        let new_height = win_size.height.min(max_height).max(700);

        let _ = window.set_size(tauri::Size::Physical(PhysicalSize {
            width: new_width,
            height: new_height,
        }));

        // Center on monitor
        let new_x = mon_pos.x + (mon_size.width as i32 - new_width as i32) / 2;
        let new_y = mon_pos.y + (mon_size.height as i32 - new_height as i32) / 2;
        let _ = window.set_position(tauri::Position::Physical(PhysicalPosition {
            x: new_x,
            y: new_y,
        }));
    }
}
