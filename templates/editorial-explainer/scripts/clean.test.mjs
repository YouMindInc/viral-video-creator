import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { clean, planCleanup, main } from './clean.mjs';

const app = 'templates/editorial-explainer/';
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'editorial-clean-test-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (relative, content = 'keep or remove') => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content);
    return file;
  };
  const config = { persona: { source: 'source/person.mp4' }, visual: { video: 'assets/inputs/product.mp4' }, captions: 'assets/inputs/speech.srt' };
  const save = () => write(app + 'template.json', JSON.stringify(config));
  save();
  const caches = ['.cache/sam2/run-test/output.mov', '.transcode-cache/video.mp4', '.waveform-cache/audio.json',
    '.hyperframes/preview/page.html', '.hyperframes/artifacts/checks/check.json', '.hyperframes/artifacts/snapshots/frame.png',
    'assets/persona/.preparing-test/cutout.webm', 'assets/persona/sam2-1234567890abcdef.webm.partial.webm',
    'assets/inputs/.upload-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.mp4', 'index.html.tmp'];
  const prepared = ['assets/persona/sam2-1234567890abcdef.webm', 'assets/persona/prepared.json', 'assets/persona/sam2-tests.json',
    'assets/persona/sam2-tests/test.jpg', 'assets/persona/scene.mp4', 'assets/persona/cutout.webm',
    'assets/visuals/posters/1234567890abcdef.jpg', 'assets/vendor/gsap.min.js', 'index.html', 'analysis/hyperframes-build.json'];
  const kept = ['source/person.mp4', 'source/notes.srt', 'assets/inputs/product.mp4', 'assets/inputs/speech.srt',
    'assets/fonts/font.ttf', 'assets/visuals/custom-poster.jpg', 'assets/persona/manual-artwork.png',
    'analysis/keyframes.json', '.hyperframes/history-id', '.hyperframes/video-state.json', 'scripts/news-channel.html'];
  for (const file of [...caches, ...prepared, ...kept]) write(app + file);
  const outputs = ['renders/editorial-explainer/run/video.mp4', 'renders/editorial-explainer/run/previous-template.json', app + 'renders/video.mp4'];
  const unrelated = ['renders/another-template/video.mp4', 'tools/sam2/models/weights.bin', 'tools/sam2/.venv/keep', 'node_modules/keep', '.cache/pnpm-store/keep'];
  for (const file of [...outputs, ...unrelated]) write(file);
  return { root, config, save, write, caches, prepared, kept, outputs, unrelated,
    exists: relative => fs.existsSync(path.join(root, relative)), run: options => clean({ repoRoot: root, ...options }, () => {}) };
}

test('default cleanup removes disposable files and preserves active assets, settings, renders and editor state', t => {
  const f = fixture(t), before = fs.readFileSync(path.join(f.root, app, 'template.json'));
  f.run();
  for (const file of f.caches) assert.equal(f.exists(app + file), false, file);
  for (const file of [...f.prepared, ...f.kept]) assert.ok(f.exists(app + file), file);
  for (const file of [...f.outputs, ...f.unrelated]) assert.ok(f.exists(file), file);
  assert.deepEqual(fs.readFileSync(path.join(f.root, app, 'template.json')), before);
  assert.equal(f.exists(app + '.cache/generate.lock'), false);
  assert.equal(f.run().items.length, 0, 'running cleanup twice is harmless');
});

test('dry-run reports the full plan without writing or deleting any files', t => {
  const f = fixture(t);
  const before = fs.readdirSync(f.root, { recursive: true }).sort();
  const plan = f.run({ dryRun: true, prepared: true, renders: true });
  assert.ok(plan.bytes > 0);
  assert.ok(plan.items.some(item => item.relative === 'renders/editorial-explainer'));
  assert.deepEqual(fs.readdirSync(f.root, { recursive: true }).sort(), before);
  for (const file of [...f.caches, ...f.prepared, ...f.kept]) assert.ok(f.exists(app + file), file);
});

test('--prepared removes derived media and stale composition but preserves source materials and renders', t => {
  const f = fixture(t);
  f.run({ prepared: true });
  for (const file of [...f.caches, ...f.prepared]) assert.equal(f.exists(app + file), false, file);
  for (const file of f.kept) assert.ok(f.exists(app + file), file);
  for (const file of [...f.outputs, ...f.unrelated]) assert.ok(f.exists(file), file);
});

test('--renders only broadens cleanup to this template output directories', t => {
  const f = fixture(t);
  f.run({ renders: true });
  for (const file of f.outputs) assert.equal(f.exists(file), false, file);
  for (const file of f.unrelated) assert.ok(f.exists(file), file);
  for (const file of [...f.prepared, ...f.kept]) assert.ok(f.exists(app + file), file);
});

test('explicitly referenced materials survive even inside a cache or output directory', t => {
  const f = fixture(t);
  f.config.visual.poster = 'assets/visuals/posters/1234567890abcdef.jpg';
  f.config.persona.source = '.cache/sam2/run-test/output.mov';
  f.config.visual.video = 'renders/video.mp4';
  f.save();
  const result = f.run({ prepared: true, renders: true });
  for (const file of [f.config.persona.source, f.config.visual.poster, f.config.visual.video]) assert.ok(f.exists(app + file), file);
  assert.equal(result.kept.length, 3);
});

test('a live generator or invalid configuration stops cleanup before any media is deleted', t => {
  const f = fixture(t);
  const lock = f.write(app + '.cache/generate.lock', String(process.pid));
  assert.throws(() => f.run(), /generator is still running/);
  for (const file of f.caches) assert.ok(f.exists(app + file), file);
  fs.unlinkSync(lock);
  f.write(app + 'template.json', 'invalid JSON');
  assert.throws(() => f.run());
  for (const file of f.caches) assert.ok(f.exists(app + file), file);
});

test('linked cleanup roots are rejected before any deletion, including links within the repository', t => {
  const f = fixture(t);
  fs.rmSync(path.join(f.root, app, '.transcode-cache'), { recursive: true });
  fs.symlinkSync(path.join(f.root, app, 'source'), path.join(f.root, app, '.transcode-cache'), 'dir');
  assert.throws(() => f.run(), /symbolic link/);
  assert.ok(f.exists(app + '.cache/sam2/run-test/output.mov'));
  assert.ok(f.exists(app + 'source/person.mp4'));
  assert.equal(f.exists(app + '.cache/generate.lock'), false);
});

test('recursive cleanup never follows symbolic links inside disposable directories', t => {
  const f = fixture(t);
  fs.symlinkSync(path.join(f.root, app, 'source'), path.join(f.root, app, '.cache/sam2/linked-source'), 'dir');
  f.run();
  assert.ok(f.exists(app + 'source/person.mp4'));
  assert.equal(f.exists(app + '.cache/sam2'), false);
});

test('bad flags and an escaping source reference fail without a cleanup', t => {
  assert.throws(() => main(['--render']), /Unknown option/);
  const f = fixture(t);
  f.config.persona.source = '../../../outside.mp4'; f.save();
  assert.throws(() => planCleanup({ repoRoot: f.root }), /escapes/);
  for (const file of f.caches) assert.ok(f.exists(app + file), file);
});
