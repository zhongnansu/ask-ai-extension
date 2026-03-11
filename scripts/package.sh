#!/bin/bash
# Package the extension into a distributable zip file
set -euo pipefail

OUTPUT_DIR="${1:-dist}"
VERSION="${2:-dev}"

mkdir -p "$OUTPUT_DIR"

zip -r "$OUTPUT_DIR/ask-ai-extension-${VERSION}.zip" \
  manifest.json \
  background.js \
  content.js \
  detection.js \
  presets.js \
  prompt.js \
  trigger.js \
  popup.js \
  icons/

echo "Packaged to $OUTPUT_DIR/ask-ai-extension-${VERSION}.zip"
