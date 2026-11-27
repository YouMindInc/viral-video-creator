#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/apps/homebrew-main/bin:$PATH"
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then source "$HOME/.nvm/nvm.sh"; fi
exec node ../../scripts/setup.mjs --sam2-only "$@"
