//! Tally's built-in assistant. The engine (llama.cpp) is compiled into the app,
//! so there is nothing to install. The model is NVIDIA's Nemotron 3 Nano 4B: it
//! is used straight from the installer when a copy was bundled with the app
//! (`src-tauri/models/`), and otherwise fetched once, on first use, into the
//! app's data folder. Everything runs on this computer.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::num::NonZeroU32;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
use llama_cpp_2::model::LlamaModel;
use llama_cpp_2::sampling::LlamaSampler;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

const MODEL_FILE: &str = "NVIDIA-Nemotron3-Nano-4B-Q4_K_M.gguf";
const MODEL_URL: &str = "https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-4B-GGUF/resolve/main/NVIDIA-Nemotron3-Nano-4B-Q4_K_M.gguf";
/// Expected size of the model file, used to tell a finished download from a partial one.
const MODEL_BYTES: u64 = 2_837_072_864;
const CONTEXT_TOKENS: u32 = 4096;
pub const PROGRESS_EVENT: &str = "tally://ai-progress";
pub const TOKEN_EVENT: &str = "tally://ai-token";

static BACKEND: OnceLock<LlamaBackend> = OnceLock::new();
static MODEL: Mutex<Option<Arc<LlamaModel>>> = Mutex::new(None);
/// One generation at a time: the model is big and the machine is shared with the user.
static BUSY: Mutex<()> = Mutex::new(());
static STOP: AtomicBool = AtomicBool::new(false);
static CANCEL_DOWNLOAD: AtomicBool = AtomicBool::new(false);
static DOWNLOADING: AtomicBool = AtomicBool::new(false);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    /// The model file is on this computer and complete.
    ready: bool,
    /// It came inside the installer rather than being downloaded.
    bundled: bool,
    loaded: bool,
    downloading: bool,
    bytes: u64,
    name: &'static str,
}

#[derive(Serialize, Clone)]
struct Progress {
    done: u64,
    total: u64,
}

#[derive(Serialize, Clone)]
struct Token<'a> {
    id: &'a str,
    text: &'a str,
}

fn downloaded_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("models");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(MODEL_FILE))
}

fn bundled_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().resource_dir().ok()?;
    [dir.join("models").join(MODEL_FILE), dir.join("resources").join("models").join(MODEL_FILE)].into_iter().find(|p| p.exists())
}

fn is_complete(p: &PathBuf) -> bool {
    fs::metadata(p).map(|m| m.len() >= MODEL_BYTES).unwrap_or(false)
}

/// The model file to use: the bundled copy first, then the downloaded one.
fn model_path(app: &AppHandle) -> Option<(PathBuf, bool)> {
    if let Some(p) = bundled_path(app) {
        return Some((p, true));
    }
    let p = downloaded_path(app).ok()?;
    is_complete(&p).then_some((p, false))
}

#[tauri::command]
pub fn ai_status(app: AppHandle) -> AiStatus {
    let found = model_path(&app);
    AiStatus {
        ready: found.is_some(),
        bundled: found.as_ref().map(|f| f.1).unwrap_or(false),
        loaded: MODEL.lock().map(|m| m.is_some()).unwrap_or(false),
        downloading: DOWNLOADING.load(Ordering::Relaxed),
        bytes: MODEL_BYTES,
        name: "NVIDIA Nemotron 3 Nano 4B",
    }
}

/// Download the model, resuming a partial file. Reports progress as events.
#[tauri::command]
pub async fn ai_download(app: AppHandle) -> Result<(), String> {
    if model_path(&app).is_some() {
        return Ok(());
    }
    if DOWNLOADING.swap(true, Ordering::SeqCst) {
        return Err("The download is already running.".into());
    }
    CANCEL_DOWNLOAD.store(false, Ordering::SeqCst);
    let result = tauri::async_runtime::spawn_blocking(move || download(&app)).await.map_err(|e| e.to_string())?;
    DOWNLOADING.store(false, Ordering::SeqCst);
    result
}

fn download(app: &AppHandle) -> Result<(), String> {
    let target = downloaded_path(app)?;
    let part = target.with_extension("gguf.part");
    let have = fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
    // A finished download that never got renamed (the app quit at the last moment).
    if have >= MODEL_BYTES {
        fs::rename(&part, &target).map_err(|e| e.to_string())?;
        return Ok(());
    }
    let agent = ureq::AgentBuilder::new().timeout_connect(Duration::from_secs(20)).timeout_read(Duration::from_secs(60)).user_agent("Tally").build();
    let mut req = agent.get(MODEL_URL);
    if have > 0 {
        req = req.set("Range", &format!("bytes={have}-"));
    }
    let resp = match req.call() {
        Ok(r) => r,
        // The partial file doesn't match the server any more: start over next time.
        Err(ureq::Error::Status(416, _)) => {
            let _ = fs::remove_file(&part);
            return Err("The partial download was out of date. Starting over.".into());
        }
        Err(e) => return Err(format!("Couldn't reach the download server: {e}")),
    };
    let resumed = resp.status() == 206;
    let mut file = if resumed {
        OpenOptions::new().append(true).open(&part).map_err(|e| e.to_string())?
    } else {
        File::create(&part).map_err(|e| e.to_string())?
    };
    let mut done = if resumed { have } else { 0 };
    let mut reader = resp.into_reader();
    let mut buf = vec![0u8; 256 * 1024];
    let mut last = Instant::now();
    loop {
        if CANCEL_DOWNLOAD.load(Ordering::Relaxed) {
            return Err("cancelled".into());
        }
        let n = reader.read(&mut buf).map_err(|e| format!("The download was interrupted: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| {
            if e.raw_os_error() == Some(28) {
                "There isn't enough free disk space. The assistant needs about 3 GB.".to_string()
            } else {
                e.to_string()
            }
        })?;
        done += n as u64;
        if last.elapsed() > Duration::from_millis(250) {
            last = Instant::now();
            let _ = app.emit(PROGRESS_EVENT, Progress { done, total: MODEL_BYTES });
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    drop(file);
    if done < MODEL_BYTES {
        return Err("The download ended early. Try again and it will pick up where it left off.".into());
    }
    fs::rename(&part, &target).map_err(|e| e.to_string())?;
    let _ = app.emit(PROGRESS_EVENT, Progress { done, total: MODEL_BYTES });
    Ok(())
}

#[tauri::command]
pub fn ai_cancel_download() {
    CANCEL_DOWNLOAD.store(true, Ordering::SeqCst);
}

/// Delete the downloaded model to free its disk space (a bundled one stays).
#[tauri::command]
pub fn ai_remove(app: AppHandle) -> Result<(), String> {
    *MODEL.lock().map_err(|e| e.to_string())? = None;
    let p = downloaded_path(&app)?;
    for f in [p.clone(), p.with_extension("gguf.part")] {
        if f.exists() {
            fs::remove_file(f).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn ai_stop() {
    STOP.store(true, Ordering::SeqCst);
}

fn backend() -> Result<&'static LlamaBackend, String> {
    if let Some(b) = BACKEND.get() {
        return Ok(b);
    }
    let b = LlamaBackend::init().map_err(|e| e.to_string())?;
    Ok(BACKEND.get_or_init(|| b))
}

fn load_model(app: &AppHandle) -> Result<Arc<LlamaModel>, String> {
    let mut slot = MODEL.lock().map_err(|e| e.to_string())?;
    if let Some(m) = slot.as_ref() {
        return Ok(m.clone());
    }
    let (path, _) = model_path(app).ok_or("The assistant's model isn't downloaded yet.")?;
    let backend = backend()?;
    // Offload to the GPU where there is one (Metal on Apple Silicon); CPU otherwise.
    let params = LlamaModelParams::default().with_n_gpu_layers(999);
    let model = LlamaModel::load_from_file(backend, &path, &params).map_err(|e| format!("Couldn't load the model: {e}"))?;
    let model = Arc::new(model);
    *slot = Some(model.clone());
    Ok(model)
}

/// Nemotron 3 Nano's ChatML-style prompt. By default an empty think block turns
/// its slow "reasoning" mode off, which is what quick chores want. With `think`
/// the model reasons first (the app hides that part) for questions that deserve it.
fn build_prompt(system: &str, user: &str, think: bool) -> String {
    let start = if think { "<think>\n" } else { "<think></think>" };
    format!("<|im_start|>system\n{system}<|im_end|>\n<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n{start}")
}

/// Ask the model. Text streams out as `tally://ai-token` events tagged with `id`;
/// the full answer is returned at the end.
#[tauri::command]
pub async fn ai_generate(app: AppHandle, id: String, system: String, prompt: String, max_tokens: u32, temperature: f32, think: Option<bool>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || generate(&app, &id, &system, &prompt, max_tokens, temperature, think.unwrap_or(false))).await.map_err(|e| e.to_string())?
}

fn generate(app: &AppHandle, id: &str, system: &str, prompt: &str, max_tokens: u32, temperature: f32, think: bool) -> Result<String, String> {
    let _turn = BUSY.lock().map_err(|e| e.to_string())?;
    STOP.store(false, Ordering::SeqCst);
    let model = load_model(app)?;
    run(&model, system, prompt, max_tokens, temperature, think, |text| {
        let _ = app.emit(TOKEN_EVENT, Token { id, text });
    })
}

/// Feed the prompt, then sample until the model finishes, the token budget runs
/// out or `ai_stop` is called. `on_text` gets each new piece of text.
fn run(model: &LlamaModel, system: &str, prompt: &str, max_tokens: u32, temperature: f32, think: bool, mut on_text: impl FnMut(&str)) -> Result<String, String> {
    let backend = backend()?;
    let ctx_params = LlamaContextParams::default().with_n_ctx(NonZeroU32::new(CONTEXT_TOKENS)).with_n_batch(512);
    let mut ctx = model.new_context(backend, ctx_params).map_err(|e| e.to_string())?;
    let vocab = model.vocab();
    let mut tokens = vocab.tokenize(build_prompt(system, prompt, think).as_bytes(), false, true);
    // Keep the end of an oversized prompt: that is where the question is.
    let room = (CONTEXT_TOKENS as usize).saturating_sub(max_tokens as usize + 8);
    if tokens.len() > room {
        tokens.drain(..tokens.len() - room);
    }
    let mut batch = LlamaBatch::new(512, 1);
    let mut pos = 0i32;
    for chunk in tokens.chunks(512) {
        batch.clear();
        for (i, t) in chunk.iter().enumerate() {
            let last = pos as usize + 1 == tokens.len();
            batch.add(*t, pos, &[0], last && i == chunk.len() - 1).map_err(|e| e.to_string())?;
            pos += 1;
        }
        ctx.decode(&mut batch).map_err(|e| e.to_string())?;
    }
    let mut sampler = if temperature <= 0.01 {
        LlamaSampler::greedy()
    } else {
        LlamaSampler::chain_simple([LlamaSampler::top_k(40), LlamaSampler::top_p(0.9, 1), LlamaSampler::temp(temperature), LlamaSampler::dist(42)])
    };
    let mut out = String::new();
    let mut pending: Vec<u8> = Vec::new();
    for _ in 0..max_tokens {
        if STOP.load(Ordering::Relaxed) {
            break;
        }
        let token = sampler.sample(&ctx, batch.n_tokens() - 1);
        sampler.accept(token);
        if vocab.is_eog(token) {
            break;
        }
        pending.extend(vocab.token_to_piece(token, false, None));
        // Emit only whole characters; a multi-byte one may arrive in pieces.
        if let Ok(text) = std::str::from_utf8(&pending) {
            if !text.is_empty() {
                out.push_str(text);
                on_text(text);
            }
            pending.clear();
        }
        batch.clear();
        batch.add(token, pos, &[0], true).map_err(|e| e.to_string())?;
        pos += 1;
        ctx.decode(&mut batch).map_err(|e| e.to_string())?;
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_has_system_user_and_a_closed_think_block() {
        let p = build_prompt("be brief", "hi", false);
        assert!(p.starts_with("<|im_start|>system\nbe brief<|im_end|>"));
        assert!(p.contains("<|im_start|>user\nhi<|im_end|>"));
        assert!(p.ends_with("<|im_start|>assistant\n<think></think>"));
    }

    #[test]
    fn thinking_mode_leaves_the_think_block_open() {
        assert!(build_prompt("s", "u", true).ends_with("<|im_start|>assistant\n<think>\n"));
    }

    #[test]
    fn partial_downloads_are_not_complete() {
        let dir = std::env::temp_dir().join(format!("tally-ai-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let f = dir.join("m.gguf");
        fs::write(&f, b"partial").unwrap();
        assert!(!is_complete(&f));
        assert!(!is_complete(&dir.join("missing.gguf")));
        fs::remove_dir_all(&dir).unwrap();
    }

    /// Needs the real model: `TALLY_TEST_MODEL=/path/to.gguf cargo test ai -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn answers_a_planning_question() {
        let path = std::env::var("TALLY_TEST_MODEL").expect("set TALLY_TEST_MODEL");
        let model = LlamaModel::load_from_file(backend().unwrap(), path, &LlamaModelParams::default().with_n_gpu_layers(999)).unwrap();
        let t = Instant::now();
        let out = run(&model, "You are a concise planner.", "List three steps to start an essay due Friday. Reply as a numbered list.", 120, 0.2, false, |_| {}).unwrap();
        println!("{out}\n-- {:?}", t.elapsed());
        assert!(!out.trim().is_empty());
        assert!(!out.contains("<think>"));
    }
}
