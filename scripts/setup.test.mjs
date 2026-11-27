import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checksum, inspectFiles, planSetup, hfDownloadArgs, installSteps, replaceEnvironment, acquireSetupLock, main } from './setup.mjs';
import { resolveWhisperModel, whisperFilename } from './runtime-paths.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'editorial-setup-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, contents = 'model bytes') => {
    const target = path.join(root, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, contents); return target;
  };
  return { root, write };
}
const ready = () => ({
  platform: 'darwin', arch: 'arm64', nodeMajor: 24, brew: '/brew', ffmpeg: '/ffmpeg', ffprobe: '/ffprobe',
  uv: '/uv', hf: '/hf.mjs', chrome: '/chrome', python: { environment: true, packages: true },
  samModel: { ready: true, missing: [], corrupt: [] }, whisperCli: '/whisper-cli',
  whisperModel: { ready: true, missing: [], corrupt: [] }
});

test('an existing installation schedules no downloads or package changes', () => {
  for (const options of [{}, { withWhisper: true }, { sam2Only: true }]) {
    assert.deepEqual(planSetup(ready(), options), { steps: [], issues: [], ready: true });
  }
});

test('fresh setup orders prerequisites before environments, models, and Chrome', () => {
  const state = { ...ready(), hf: null, chrome: null, uv: null, ffmpeg: null, ffprobe: null,
    python: { environment: false, packages: false }, samModel: { ready: false, missing: ['weights'], corrupt: [] },
    whisperCli: null, whisperModel: { ready: false, missing: ['model'], corrupt: [] } };
  const plan = planSetup(state, { withWhisper: true });
  assert.deepEqual(plan.steps.map(s => s.id), ['tools', 'node', 'venv', 'python', 'sam-model', 'whisper-model', 'chrome']);
  assert.deepEqual(plan.steps[0].formulas, ['ffmpeg', 'uv', 'whisper.cpp']);
  assert.equal(plan.issues.length, 0);
  assert.ok(!planSetup(state).steps.some(s => s.id === 'whisper-model'));
  assert.ok(!planSetup(state, { sam2Only: true }).steps.some(s => ['node', 'chrome'].includes(s.id)));
});

test('complete manifests with missing or corrupted weights are detected by their actual bytes', t => {
  const { root, write } = fixture(t);
  const model = write('package/Manifest.json', '{"ok":true}');
  const weights = write('package/weights.bin', 'verified weights');
  const expected = { 'package/Manifest.json': checksum(model), 'package/weights.bin': checksum(weights) };
  assert.equal(inspectFiles(root, expected).ready, true);
  fs.writeFileSync(weights, 'partial transfer');
  assert.deepEqual(inspectFiles(root, expected).corrupt, ['package/weights.bin']);
  fs.unlinkSync(weights);
  assert.deepEqual(inspectFiles(root, expected).missing, ['package/weights.bin']);
  assert.throws(() => inspectFiles(root, { '../outside': 'hash' }), /Invalid model/);
});

test('downloads use isolated hf, immutable revisions, and only requested files', () => {
  const revision = 'a'.repeat(40);
  const args = hfDownloadArgs('apple/coreml-sam2-small', revision, '/folder with spaces', ['part/weights.bin']);
  assert.deepEqual(args.slice(0, 6), ['tool', 'run', '--from', 'huggingface-hub==1.13.0', '--python', '3.12']);
  assert.equal(args[args.indexOf('--revision') + 1], revision);
  assert.equal(args[args.indexOf('--local-dir') + 1], '/folder with spaces');
  assert.ok(!args.includes('--force-download'), 'missing files retain download/cache resume behavior');
  assert.ok(hfDownloadArgs('repo', revision, '/folder', ['bad.bin'], true).includes('--force-download'));
  assert.throws(() => hfDownloadArgs('repo', 'main', '/folder', ['file']), /manifest/);
  assert.throws(() => hfDownloadArgs('repo', revision, '/folder', ['../file']), /manifest/);
});

test('fresh Whisper downloads use the repo, existing models and explicit overrides are reused', t => {
  const { root, write } = fixture(t);
  const options = { repoRoot: path.join(root, 'repo'), home: path.join(root, 'home'), override: '' };
  assert.equal(resolveWhisperModel(options), path.join(options.repoRoot, '.cache/models/whisper', whisperFilename));
  const old = write('home/.cache/whisper-cpp-models/' + whisperFilename);
  assert.equal(resolveWhisperModel(options), old);
  const local = write('repo/.cache/models/whisper/' + whisperFilename);
  assert.equal(resolveWhisperModel(options), local);
  assert.equal(resolveWhisperModel({ ...options, override: '~/my-model.bin' }), path.join(options.home, 'my-model.bin'));
  assert.equal(resolveWhisperModel({ ...options, override: '/custom/model.bin' }), '/custom/model.bin');
});

test('unsupported platforms, missing Homebrew and invalid overrides block installation before writes', async () => {
  const state = { ...ready(), platform: 'linux', arch: 'x64', nodeMajor: 20, brew: null, uv: null,
    whisperModel: { ready: false, custom: true } };
  const plan = planSetup(state, { withWhisper: true });
  assert.equal(plan.issues.length, 4);
  let calls = 0;
  await assert.rejects(installSteps(plan, () => calls++, () => ({ ready: true })), /Apple Silicon/);
  assert.equal(calls, 0);
});

test('interrupted installs stop subsequent steps and unsuccessful verification cannot report success', async () => {
  const plan = { issues: [], ready: false, steps: [{ id: 'first', label: 'First' }, { id: 'second', label: 'Second' }] };
  const ran = [];
  await assert.rejects(installSteps(plan, step => { ran.push(step.id); throw new Error('download interrupted'); }, () => ({ ready: true })), /interrupted/);
  assert.deepEqual(ran, ['first']);
  await assert.rejects(installSteps({ ...plan, steps: [] }, () => {}, () => plan), /Setup is incomplete/);
});

test('environment recreation preserves the old directory and restores it on failure', async t => {
  const { root, write } = fixture(t);
  const file = write('.venv/keep.txt', 'old environment'), directory = path.dirname(file);
  await assert.rejects(replaceEnvironment(directory, () => {
    write('.venv/partial.txt', 'new but incomplete'); throw new Error('network failure');
  }), /network failure/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'old environment');
  assert.ok(fs.readdirSync(root).some(n => n.startsWith('.venv.failed-')));
  await replaceEnvironment(directory, () => write('.venv/new.txt', 'new environment'));
  assert.ok(fs.existsSync(path.join(directory, 'new.txt')));
  const backup = fs.readdirSync(root).find(n => n.startsWith('.venv.backup-'));
  assert.equal(fs.readFileSync(path.join(root, backup, 'keep.txt'), 'utf8'), 'old environment');
});

test('invalid options fail before setup starts', async () => {
  await assert.rejects(main(['--whisper']), /Unknown option/);
  await assert.rejects(main(['--sam2-only', '--with-whisper']), /full setup/);
});

test('concurrent installers are blocked and a completed installer releases its lock', t => {
  const { root } = fixture(t);
  const release = acquireSetupLock(root);
  try { assert.throws(() => acquireSetupLock(root), /Another setup/); }
  finally { release(); }
  assert.equal(fs.existsSync(path.join(root, '.cache/setup.lock')), false);
  acquireSetupLock(root)();
});
