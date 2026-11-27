#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/apps/homebrew-main/bin:$PATH"
if ! command -v uv >/dev/null 2>&1; then printf 'Install uv first, then rerun npm run setup:sam2.\n'; exit 1; fi
if [ ! -x .venv/bin/python ]; then uv venv --python 3.12 .venv; fi
if ! .venv/bin/python -c 'import coremltools, cv2, numpy, PIL' >/dev/null 2>&1; then
  uv pip install --python .venv/bin/python --find-links wheels -r requirements.txt
fi
for part in ImageEncoder PromptEncoder MaskDecoder; do
  if [ ! -f "models/coreml-sam2-small/SAM2Small${part}FLOAT16.mlpackage/Manifest.json" ]; then
    uvx --from huggingface-hub hf download apple/coreml-sam2-small --local-dir models/coreml-sam2-small
    break
  fi
done
printf 'SAM2 Python environment and Core ML models are ready.\n'
