#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
curl --fail --location --retry 3 https://raw.githubusercontent.com/snakers4/silero-vad/v5.1.2/src/silero_vad/data/silero_vad.onnx -o src-tauri/models/silero_vad.onnx.tmp
mv src-tauri/models/silero_vad.onnx.tmp src-tauri/models/silero_vad.onnx
curl --fail --location https://raw.githubusercontent.com/snakers4/silero-vad/v5.1.2/LICENSE -o src-tauri/models/LICENSE.silero
