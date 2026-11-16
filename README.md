# Audio Caffeine

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

The app remembers its window size and maximized state on normal exit and restores them on the next launch. The first launch uses the default size.

Open audio, press Analyze, then adjust threshold and minimum non-speech duration. Green marks speech; amber marks non-speech; the unprocessed part remains unmarked. Click the waveform to seek, zoom to inspect boundaries, and use Play/Pause to listen. After a successful analysis, Play becomes Play speech and skips non-speech using the current settings, stopping when no speech remains. Cancelled or incomplete analysis keeps normal playback. Speech playback uses Web Audio buffer sources scheduled contiguously on the audio clock, with boundaries aligned to the original decoded samples. The original multichannel audio is retained for playback; only inference uses the mono 16 kHz copy. The waveform follows original timestamps while its media element stays paused. No speech padding, fades, or edited file are introduced. Pause, waveform clicks, and settings changes cancel queued sources and rebuild the schedule from the current source position. Cancel stops analysis and retains partial results. Settings reclassify cached probabilities without rerunning inference.

Audio is decoded and resampled to mono 16 kHz by the webview's Web Audio API, then passed to the Rust worker. Supported codecs depend on WKWebView; WAV, MP3, and M4A are typical. There is no application-imposed duration or file-size cap. This version still decodes the full file in memory, so available memory and Web Audio implementation limits determine which recordings can be loaded. No audio is uploaded. Inference processes 512-sample frames with recurrent state and 64 samples of context. Updates are sent in groups of 32 frames; the last short frame is zero-padded. Segmentation uses threshold hysteresis and minimum durations. Non-speech includes sounds other than silence; this is an analysis tool, not an automatic editor.

The selector currently exposes Silero only. New algorithms can use the same timestamp/probability update contract and command dispatch. Browser preview (`npm run dev`) supports loading/playback but clearly disables native inference.

## Validation status

Run `npm test` for scheduling, sample boundaries, cursor mapping, pause/resume, seeking, completion, and cancellation checks. After compilation by `npm test`, serve the repository locally and open `tests/offline-playback.html` for an actual Web Audio offline-render check. The Chromium check passed with zero sample error across two stereo speech segments, including their first samples. This validates rendered samples, not macOS output-device behavior. Frontend production build can be checked with `npm run build`. Native compilation, WKWebView playback, bundled model loading, and end-to-end inference must be verified on macOS; the development cloud host has no macOS SDK. No native build or macOS runtime validation is claimed.
