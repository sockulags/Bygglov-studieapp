//! Tauri shell for Bygglov-studieapp.
//!
//! The app is almost entirely web code (see `../src`). The Rust side only registers the
//! plugins the web view needs: local SQLite, auto-update with restart, file dialogs,
//! reading/writing the files chosen in those dialogs (export/import of study data),
//! opening links in the system browser and HTTP for the study assistant (phase 3).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            // The updater is desktop-only.
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Bygglov-studieapp");
}
