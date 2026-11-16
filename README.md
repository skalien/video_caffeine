# Caffeine Audio Lab

macOS audio analyzer built with Tauri 2, Rust, React, and WaveSurfer. Silero VAD v5.1.2 runs through ONNX Runtime's default CPU provider, with intra-op and inter-op threads set to one and parallel graph execution disabled. No accelerator benchmarks or accelerator providers are included.

## Run on macOS

Install Xcode Command Line Tools (`xcode-select --install`), a current Rust stable toolchain, and Node.js 20.19+.

```sh
npm ci
sh scripts/download-model.sh
npm run tauri dev
```

Build an app/DMG with `npm run tauri build`. The model must be downloaded before building; it is bundled in the application. Model license is in `src-tauri/models/LICENSE.silero`. ONNX Runtime build dependencies may require network access during the first Rust build.

## Usage

Open audio, press Analyze, then adjust threshold and minimum non-speech duration. Green marks speech; amber marks non-speech; the unprocessed part remains unmarked. Click the waveform to seek, zoom to inspect boundaries, and use Play/Pause to listen. After a successful analysis, Play becomes Play speech and skips non-speech using the current settings, stopping when no speech remains. Cancelled or incomplete analysis keeps normal playback. Skipping uses playback-position checks and media seeks; transitions are not sample-accurate edits. Cancel stops analysis and retains partial results. Settings reclassify cached probabilities without rerunning inference.

Audio is decoded and resampled to mono 16 kHz by the webview's Web Audio API, then passed to the Rust worker. Supported codecs depend on WKWebView; WAV, MP3, and M4A are typical. There is no application-imposed duration or file-size cap. This version still decodes the full file in memory, so available memory and Web Audio implementation limits determine which recordings can be loaded. No audio is uploaded. Inference processes 512-sample frames with recurrent state and 64 samples of context. Updates are sent in groups of 32 frames; the last short frame is zero-padded. Segmentation uses threshold hysteresis and minimum durations. Non-speech includes sounds other than silence; this is an analysis tool, not an automatic editor.

The selector currently exposes Silero only. New algorithms can use the same timestamp/probability update contract and command dispatch. Browser preview (`npm run dev`) supports loading/playback but clearly disables native inference.

## Validation status

Frontend production build can be checked with `npm run build`. Native compilation, WKWebView playback, bundled model loading, and end-to-end inference must be verified on macOS; the development cloud host has no Rust toolchain or macOS SDK. No native build or macOS runtime validation is claimed.
