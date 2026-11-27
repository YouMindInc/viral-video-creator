import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const whisperFilename = 'ggml-large-v3-turbo.bin';
export function resolveWhisperModel({ repoRoot = repositoryRoot, home = os.homedir(), override = process.env.WHISPER_MODEL } = {}) {
  if (override) return path.resolve(override.startsWith('~/') ? path.join(home, override.slice(2)) : override);
  const local = path.join(repoRoot, '.cache/models/whisper', whisperFilename);
  const existing = path.join(home, '.cache/whisper-cpp-models', whisperFilename);
  return fs.existsSync(local) || !fs.existsSync(existing) ? local : existing;
}
