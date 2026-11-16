#!/bin/bash
set -e

source "$HOME/.cargo/env"
cd "$(dirname "$0")"
npm run tauri dev
