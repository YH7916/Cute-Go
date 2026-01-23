//! Tauri commands for native ONNX inference
//!
//! These commands expose the Rust ONNX engine to the frontend,
//! providing high-performance AI analysis for the desktop app.

use crate::onnx_engine::{self, AnalysisOptions, AnalysisResult, ExecutionProviderInfo, ExecutionProviderPreference};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as Base64Engine};
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

/// Input for batch analysis
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchInput {
    pub sign_map: Vec<Vec<i8>>,
    #[serde(default)]
    pub options: AnalysisOptions,
}

/// State for chunked model upload
static MODEL_UPLOAD_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

/// Get the temp file path for model upload
fn get_model_temp_path() -> PathBuf {
    std::env::temp_dir().join(format!("kaya-model-{}.onnx", std::process::id()))
}

/// Start a chunked model upload
/// Returns the temp file path where chunks will be written
#[tauri::command]
pub async fn onnx_start_upload() -> Result<String, String> {
    let path = get_model_temp_path();
    
    // Create/truncate the file
    File::create(&path)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    
    // Store the path for subsequent chunks
    let mut upload_path = MODEL_UPLOAD_PATH.lock().unwrap();
    *upload_path = Some(path.clone());
    
    Ok(path.to_string_lossy().to_string())
}

/// Upload a chunk of the model (base64 encoded for efficient IPC)
/// Using base64 because JSON array serialization of bytes is very slow
#[tauri::command]
pub async fn onnx_upload_chunk(chunk_base64: String) -> Result<(), String> {
    let path = {
        let upload_path = MODEL_UPLOAD_PATH.lock().unwrap();
        upload_path.clone().ok_or("No upload in progress")?
    };
    
    // Decode base64 and write in a blocking task to not block the runtime
    tokio::task::spawn_blocking(move || {
        let chunk_bytes = BASE64
            .decode(&chunk_base64)
            .map_err(|e| format!("Failed to decode base64 chunk: {}", e))?;
        
        let mut file = OpenOptions::new()
            .append(true)
            .open(&path)
            .map_err(|e| format!("Failed to open temp file: {}", e))?;
        
        file.write_all(&chunk_bytes)
            .map_err(|e| format!("Failed to write chunk: {}", e))?;
        
        Ok::<(), String>(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Finish the upload and initialize the ONNX engine from the temp file
/// Optionally caches the model with a given ID for faster future loads
#[tauri::command]
pub async fn onnx_finish_upload(model_id: Option<String>, app_handle: tauri::AppHandle) -> Result<(), String> {
    let temp_path = {
        let mut upload_path = MODEL_UPLOAD_PATH.lock().unwrap();
        upload_path.take().ok_or("No upload in progress")?
    };
    
    // If model_id provided, cache the model in app data directory
    let final_path = if let Some(id) = model_id {
        let app_data = app_handle.path().app_data_dir()
            .map_err(|e| format!("Failed to get app data dir: {}", e))?;
        let models_dir = app_data.join("models");
        std::fs::create_dir_all(&models_dir)
            .map_err(|e| format!("Failed to create models dir: {}", e))?;
        
        let cached_path = models_dir.join(format!("{}.onnx", id));
        
        // Move temp file to cache location
        std::fs::rename(&temp_path, &cached_path)
            .or_else(|_| {
                // If rename fails (cross-device), copy and delete
                std::fs::copy(&temp_path, &cached_path)?;
                std::fs::remove_file(&temp_path)
            })
            .map_err(|e| format!("Failed to cache model: {}", e))?;
        
        cached_path
    } else {
        temp_path
    };
    
    let path_str = final_path.to_string_lossy().to_string();
    
    tokio::task::spawn_blocking(move || {
        onnx_engine::initialize_engine_from_path(&path_str)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Check if a model is cached and return its path
#[tauri::command]
pub async fn onnx_get_cached_model(model_id: String, app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    let app_data = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let cached_path = app_data.join("models").join(format!("{}.onnx", model_id));
    
    if cached_path.exists() {
        Ok(Some(cached_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

/// Delete a cached model from the app data directory
#[tauri::command]
pub async fn onnx_delete_cached_model(model_id: String, app_handle: tauri::AppHandle) -> Result<bool, String> {
    let app_data = app_handle.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let cached_path = app_data.join("models").join(format!("{}.onnx", model_id));
    
    if cached_path.exists() {
        std::fs::remove_file(&cached_path)
            .map_err(|e| format!("Failed to delete cached model: {}", e))?;
        Ok(true)
    } else {
        // Model wasn't cached, nothing to delete
        Ok(false)
    }
}

/// Initialize the ONNX engine with model bytes (raw Vec<u8>)
/// Note: This may be slow for large models due to JSON serialization
#[tauri::command]
pub async fn onnx_initialize(model_bytes: Vec<u8>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || onnx_engine::initialize_engine(&model_bytes))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

/// Initialize the ONNX engine with base64-encoded model bytes
/// This is faster for large models as strings serialize more efficiently than byte arrays
#[tauri::command]
pub async fn onnx_initialize_base64(model_base64: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let model_bytes = BASE64
            .decode(&model_base64)
            .map_err(|e| format!("Failed to decode base64: {}", e))?;
        onnx_engine::initialize_engine(&model_bytes)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Initialize the ONNX engine from a file path
#[tauri::command]
pub async fn onnx_initialize_from_path(model_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || onnx_engine::initialize_engine_from_path(&model_path))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

/// Analyze a single position
#[tauri::command]
pub async fn onnx_analyze(
    sign_map: Vec<Vec<i8>>,
    options: AnalysisOptions,
) -> Result<AnalysisResult, String> {
    tokio::task::spawn_blocking(move || onnx_engine::analyze_position(sign_map, options))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

/// Analyze multiple positions in a batch
#[tauri::command]
pub async fn onnx_analyze_batch(inputs: Vec<BatchInput>) -> Result<Vec<AnalysisResult>, String> {
    tokio::task::spawn_blocking(move || {
        let batch: Vec<(Vec<Vec<i8>>, AnalysisOptions)> = inputs
            .into_iter()
            .map(|i| (i.sign_map, i.options))
            .collect();
        onnx_engine::analyze_batch(batch)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Dispose the ONNX engine
#[tauri::command]
pub async fn onnx_dispose() -> Result<(), String> {
    tokio::task::spawn_blocking(onnx_engine::dispose_engine)
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

/// Check if the ONNX engine is initialized
#[tauri::command]
pub fn onnx_is_initialized() -> bool {
    onnx_engine::is_engine_initialized()
}

/// Get information about the current execution provider
#[tauri::command]
pub fn onnx_get_provider_info() -> Option<ExecutionProviderInfo> {
    onnx_engine::get_provider_info()
}

/// Get available execution providers for this platform
#[tauri::command]
pub fn onnx_get_available_providers() -> Vec<ExecutionProviderInfo> {
    onnx_engine::get_available_providers()
}

/// Set the preferred execution provider
/// Note: This takes effect on the next engine initialization
#[tauri::command]
pub fn onnx_set_provider_preference(preference: String) -> Result<(), String> {
    let pref = match preference.as_str() {
        "auto" => ExecutionProviderPreference::Auto,
        "cuda" => ExecutionProviderPreference::Cuda,
        "coreml" => ExecutionProviderPreference::CoreMl,
        "directml" => ExecutionProviderPreference::DirectMl,
        "nnapi" => ExecutionProviderPreference::Nnapi,
        "cpu" => ExecutionProviderPreference::Cpu,
        _ => return Err(format!("Unknown execution provider: {}", preference)),
    };
    onnx_engine::set_execution_provider_preference(pref);
    Ok(())
}

/// Get the current execution provider preference
#[tauri::command]
pub fn onnx_get_provider_preference() -> String {
    match onnx_engine::get_execution_provider_preference() {
        ExecutionProviderPreference::Auto => "auto",
        ExecutionProviderPreference::Cuda => "cuda",
        ExecutionProviderPreference::CoreMl => "coreml",
        ExecutionProviderPreference::DirectMl => "directml",
        ExecutionProviderPreference::Nnapi => "nnapi",
        ExecutionProviderPreference::Cpu => "cpu",
    }.to_string()
}
