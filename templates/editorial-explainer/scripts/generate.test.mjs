import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { Questions, materialPath, collectMaterials, importMaterial, snapshotProject, command, verifyOutput } from './generate.mjs';
import { root, asset, readConfig, build, digest, parseSrt, probe } from './hyperframes-project.mjs';

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'editorial-generate-test-')));
process.on('exit', () => fs.rmSync(temp, { recursive: true, force: true }));
const base = readConfig();
function questions(answers) {
  let output = '';
  const q = new Questions(Readable.from([answers.join('\n') + '\n']), new Writable({ write(chunk, _encoding, done) { output += chunk; done(); } }));
  return { q, output: () => output };
}

test('Finder paths with spaces, quoting, Unicode and shell characters stay literal', () => {
  const filename = path.join(temp, '人物 $(echo unsafe) `literal`.mp4');
  fs.writeFileSync(filename, 'fixture');
  assert.equal(materialPath(`'${filename}'`), filename);
  assert.equal(materialPath(`"${filename}"`), filename);
  assert.equal(materialPath(filename.replace(/([\s()$`])/g, '\\$1')), filename);
  assert.equal(materialPath(pathToFileURL(filename).href), filename);
  assert.throws(() => materialPath(temp), /不是資料夾/);
});

test('Enter reuses sample materials, captions, and existing positions', async () => {
  const { q } = questions(Array(8).fill(''));
  try {
    const plan = await collectMaterials(q, base);
    assert.equal(plan.person.file, asset(base.persona.source));
    assert.equal(plan.visual.file, asset(base.visual.video));
    assert.equal(plan.captions.mode, 'keep');
    assert.equal(plan.config.captions, base.captions);
    assert.deepEqual(plan.config.layout, base.layout);
  } finally { q.close(); }
});

test('A new speaker cannot keep old captions; invalid answers retry without saving', async () => {
  const before = digest(path.join(root, 'template.json'));
  const other = asset(base.persona.source === 'source/free-skills-share.mp4' ? 'source/character-talking.mp4' : 'source/free-skills-share.mp4');
  const { q, output } = questions([other, '', 'New brand', 'New title', '-', '-', 'keep', 'none', 'invalid mode', 'original']);
  try {
    const plan = await collectMaterials(q, base);
    assert.equal(plan.config.captions, '');
    assert.equal(plan.config.fallbackCaption, '');
    assert.equal(plan.config.headline[1], '');
    assert.equal(plan.config.persona.mode, 'original');
    assert.match(output(), /換了人物錄影/);
    assert.match(output(), /sam2 \/ original/);
    assert.equal(digest(path.join(root, 'template.json')), before);
  } finally { q.close(); }
});

test('EOF cancels promptly and leaves the active composition untouched', async () => {
  const before = digest(path.join(root, 'index.html'));
  const { q } = questions(['']);
  try { await assert.rejects(collectMaterials(q, base), /輸入已結束/); }
  finally { q.close(); }
  assert.equal(digest(path.join(root, 'index.html')), before);
});

test('Subtitle validation catches overlaps and clamps at the speaker duration', () => {
  const srt = '1\n00:00:00,000 --> 00:00:01,000\nHello\n\n2\n00:00:01,000 --> 00:00:10,000\nWorld';
  assert.equal(parseSrt(srt, 2).at(-1).end, 2);
  assert.throws(() => parseSrt(srt.replace('00:00:01,000 -->', '00:00:00,900 -->'), 2), /重疊/);
  assert.throws(() => parseSrt('not subtitles', 2), /SRT/);
});

test('Imports are content-addressed and preserve the original file', () => {
  const input = path.join(temp, 'import.srt');
  fs.writeFileSync(input, 'generator-test-' + path.basename(temp));
  const hash = digest(input);
  const relative = importMaterial(input, 'captions');
  try {
    assert.equal(importMaterial(input, 'captions'), relative);
    assert.equal(digest(asset(relative)), hash);
    assert.equal(digest(input), hash);
    assert.equal(importMaterial(asset(base.persona.source), 'persona'), base.persona.source);
  } finally { fs.unlinkSync(asset(relative)); }
});

test('Each render receives a self-contained snapshot, including fonts, GSAP, video and audio', () => {
  const target = path.join(temp, 'project');
  const { html } = build(base, false, { write: false });
  snapshotProject(html, target);
  assert.equal(fs.readFileSync(path.join(target, 'index.html'), 'utf8'), html);
  assert.equal(digest(path.join(target, base.persona.source)), digest(asset(base.persona.source)));
  for (const file of ['assets/fonts/Georgia.ttf', 'assets/vendor/gsap.min.js', base.visual.video]) assert.ok(fs.statSync(path.join(target, file)).size > 0);
  assert.throws(() => snapshotProject('<script src="../../package.json"></script>', path.join(temp, 'bad')), /範圍|ENOENT/);
});

test('Subprocess failures and cancellation reject instead of reporting success', async () => {
  await command(process.execPath, ['-e', 'process.exit(0)']);
  await assert.rejects(command(process.execPath, ['-e', 'process.exit(7)']), /未完成（7）/);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 150);
  try { await assert.rejects(command(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { signal: controller.signal }), /取消/); }
  finally { clearTimeout(timer); }
});

test('Output verification rejects missing audio, wrong dimensions and duration', () => {
  const file = asset('source/character-talking.mp4');
  const info = probe(file);
  verifyOutput(file, { duration: info.seconds, audio: true });
  assert.throws(() => verifyOutput(file, { duration: info.seconds, audio: false }), /音軌/);
  assert.throws(() => verifyOutput(file, { duration: info.seconds + 1, audio: true }), /長度/);
  assert.throws(() => verifyOutput(asset(base.visual.video), { duration: info.seconds, audio: true }), /尺寸/);
});
