#!/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/apps/homebrew-main/bin:$PATH"
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then source "$HOME/.nvm/nvm.sh"; fi
if ! command -v node >/dev/null 2>&1; then printf 'Node.js 22+ is required.\n'; exit 1; fi
if ! node --input-type=module -e "import {createRequire} from 'node:module'; const require=createRequire(process.cwd()+'/templates/editorial-explainer/package.json'); require.resolve('hyperframes/package.json'); require.resolve('gsap/dist/gsap.min.js')" >/dev/null 2>&1; then
  printf 'Installing the locked workspace dependencies…\n'
  pnpm install --frozen-lockfile --prefer-offline
fi
printf '\nOpening Viral video creator / Editorial explainer. SAM2 processing starts only when requested.\n'
pnpm dev:editorial-explainer
