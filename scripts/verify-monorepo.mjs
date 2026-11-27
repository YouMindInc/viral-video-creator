import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hf } from '../templates/editorial-explainer/scripts/hyperframes-project.mjs';
import { sam2Repo } from '../templates/editorial-explainer/scripts/sam2-bridge.mjs';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
assert.equal(sam2Repo, path.join(root, 'tools/sam2'), 'template must use the bundled SAM2 tool');
assert.ok(hf.startsWith(path.join(root, 'node_modules') + path.sep), 'CLI resolves from workspace dependencies');
function run(bin, args, cwd = root) {
  const result = spawnSync(bin, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(process.execPath, ['--test', 'scripts/setup.test.mjs']);
for (const template of ['editorial-explainer', 'prompt-recipe', 'prompt-recipe-advanced', 'quickcut-tutorial']) {
  for (const command of ['build', 'verify']) run('pnpm', ['--filter', '@viral-video-creator/' + template, command]);
  run(hf, ['lint', 'templates/' + template, '--json']);
}
const manifest = JSON.parse(fs.readFileSync(path.join(sam2Repo, 'model-files.sha256.json')));
for (const [relative, expected] of Object.entries(manifest.files)) {
  const file = path.join(sam2Repo, relative);
  assert.ok(fs.existsSync(file), 'Missing model file; run npm run setup:sam2: ' + relative);
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), expected, 'model integrity: ' + relative);
}
run(path.join(sam2Repo, '.venv/bin/python'), ['-c', 'import sys, pathlib, importlib.util; expected = pathlib.Path.cwd() / ".venv"; assert pathlib.Path(sys.prefix) == expected; assert all(importlib.util.find_spec(m) for m in ["coremltools", "cv2", "numpy", "PIL"]); print("SAM2 relocated Python environment and installed modules: OK")'], sam2Repo);
console.log('PASS: pnpm workspace, template checks, bundled SAM2 routing, Core ML model integrity and relocated Python environment.');
