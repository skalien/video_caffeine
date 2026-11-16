#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use tauri::{ipc::Channel, Manager};
use serde::Serialize;
use ort::{session::Session, value::Tensor};
use ndarray::{Array2, Array3, arr0};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
#[derive(Default)]
struct Jobs { busy: Arc<AtomicBool>, cancel: Arc<AtomicBool> }
#[derive(Clone, Serialize)]
struct Frame { start: f32, end: f32, probability: f32 }
#[derive(Serialize)]
struct Update { frames: Vec<Frame>, progress: f32 }
#[tauri::command]
fn cancel(jobs: tauri::State<Jobs>) { jobs.cancel.store(true, Ordering::Relaxed); }
#[tauri::command]
async fn analyze(app: tauri::AppHandle, jobs: tauri::State<'_, Jobs>, samples: Vec<f32>, algorithm: String, updates: Channel<Update>) -> Result<(), String> {
 if algorithm != "silero" { return Err("Unsupported algorithm".into()); }
 if samples.is_empty() || samples.iter().any(|x| !x.is_finite()) { return Err("Choose non-empty audio containing only finite samples".into()); }
 if jobs.busy.swap(true, Ordering::SeqCst) { return Err("An analysis is already running".into()); }
 jobs.cancel.store(false, Ordering::Relaxed);
 let busy = jobs.busy.clone(); let cancelled = jobs.cancel.clone();
 let path = app.path().resource_dir().map_err(|e| {busy.store(false,Ordering::SeqCst);e.to_string()})?.join("models/silero_vad.onnx");
 tauri::async_runtime::spawn_blocking(move || {
  struct Guard(Arc<AtomicBool>); impl Drop for Guard {fn drop(&mut self){self.0.store(false,Ordering::SeqCst);}}
  let _guard = Guard(busy);
  let run = || -> Result<(), Box<dyn std::error::Error>> {
   let mut session = Session::builder()?.with_intra_threads(1)?.with_inter_threads(1)?.with_parallel_execution(false)?.commit_from_file(path)?;
   let mut state = Array3::<f32>::zeros((2,1,128));
   let mut context = vec![0f32;64]; let mut frames = Vec::new();
   for (i, chunk) in samples.chunks(512).enumerate() {
    if cancelled.load(Ordering::Relaxed) { return Err("Analysis cancelled".into()); }
    let mut input = context.clone(); input.extend_from_slice(chunk); input.resize(576,0.);
    context.copy_from_slice(&input[512..576]);
    let outputs = session.run(ort::inputs!["input" => Tensor::from_array(Array2::from_shape_vec((1,576), input)?)?, "state" => Tensor::from_array(state.clone())?, "sr" => Tensor::from_array(arr0(16000i64))?])?;
    let (_, probability) = outputs["output"].try_extract_tensor::<f32>()?;
    let (_, next_state) = outputs["stateN"].try_extract_tensor::<f32>()?;
    state = Array3::from_shape_vec((2,1,128),next_state.to_vec())?;
    let end = ((i*512+chunk.len()) as f32)/16000.;
    frames.push(Frame{start:i as f32*0.032,end,probability:probability[0]});
    if frames.len() >= 32 || i*512+chunk.len() == samples.len() {
     updates.send(Update{frames:std::mem::take(&mut frames),progress:(i*512+chunk.len()) as f32/samples.len() as f32})?;
    }
   } Ok(())
  }; run().map_err(|e|e.to_string())
 }).await.map_err(|e|e.to_string())?
}
fn main() {
 tauri::Builder::default()
  .plugin(
   tauri_plugin_window_state::Builder::default()
    .with_state_flags(
     tauri_plugin_window_state::StateFlags::SIZE
      | tauri_plugin_window_state::StateFlags::MAXIMIZED,
    )
    .build(),
  )
  .manage(Jobs::default())
  .invoke_handler(tauri::generate_handler![analyze,cancel])
  .run(tauri::generate_context!())
  .expect("Failed to run app");
}
