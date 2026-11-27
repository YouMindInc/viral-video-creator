import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { root, glyphs, readConfig, normalizeConfig, build } from './build.mjs';
import { tokens, revealTimes, caption } from './voiceover.mjs';

const sample = () => JSON.parse(fs.readFileSync(path.join(root, 'template.json'), 'utf8'));
const sceneBodies = html => [...html.matchAll(/<div id="s\d+" class="scene[^"]*clip"[^>]*>([\s\S]*?)<\/div>\n/g)].map(m => m[1]);

test('the bundled sample builds every scene in order with one caption per voice line', () => {
  const { metadata, html } = build(readConfig(), { write: false });
  assert.deepEqual(metadata.scenes.map(s => s.kind), ['hook', 'grid', 'chapter', 'swap', 'swap', 'swap', 'chapter', 'swap', 'swap', 'swap', 'outro']);
  metadata.scenes.forEach((s, i) => assert.ok(i === 0 || Math.abs(s.start - metadata.scenes[i - 1].end) < 1e-9, 'scenes are back to back'));
  assert.equal(metadata.duration, metadata.scenes.at(-1).end);
  assert.equal((html.match(/class="cap clip/g) || []).length, metadata.lines);
  assert.ok(fs.existsSync(path.join(root, metadata.soundtrack)), 'voice, sound effects and music are mixed into one file');
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
  assert.match(html, /<span class="tag paid-tag">PAID<\/span>/);
  assert.match(html, /<span id="s\d+-name" class="typed">Jitsi Meet<\/span>/);
});

test('scenes hold plain spans only, so HyperFrames keeps one timeline row per scene', () => {
  const bodies = sceneBodies(build(readConfig(), { write: false }).html);
  assert.equal(bodies.length, 11);
  for (const body of bodies) assert.doesNotMatch(body, /<(div|svg|img|video)\b/);
});

test('a single chapter without a line skips its card, and the avatar can be an image or removed', () => {
  const base = sample();
  const one = { ...base, chapters: [{ ...base.chapters[0], say: '' }], outro: { ...base.outro, pick: 0 } };
  assert.deepEqual(build(one, { write: false }).metadata.scenes.map(s => s.kind), ['hook', 'grid', 'swap', 'swap', 'swap', 'outro']);
  const none = build({ ...one, avatar: '' }, { write: false }).html;
  assert.doesNotMatch(none, /id="avatar"/);
  const image = build({ ...one, avatar: 'assets/brand/youmind-app-icon.png' }, { write: false });
  assert.match(image.html, /<img id="mood-neutral" class="mood" src="assets\/brand\/youmind-app-icon\.png"/);
  assert.ok(!/"mood":"(wow|happy|think)"/.test(image.html), 'moods without an image fall back to the neutral face');
});

test('captions reveal words, CJK characters and highlights in step with the voice', () => {
  assert.deepEqual(tokens('別再為這{9 個 App}付錢了').map(t => t.text), ['別', '再', '為', '這', '9 個 App', '付', '錢', '了']);
  const list = tokens('Swap it for {Cap}.'), times = revealTimes(list, 10, 2);
  assert.ok(times.every((t, i) => t >= 10 && t <= 11.8 && (!i || t >= times[i - 1])));
  const { html, reveals } = caption('c', { text: 'Design and {prototype}, right here.', start: 1, seconds: 2 });
  assert.match(html, /<span class="nw"><span id="c-2" class="w hl">prototype<\/span><span id="c-3" class="w">,<\/span><\/span>/);
  assert.deepEqual(reveals.filter(r => r.hl).map(r => r.id), ['c-2']);
});

test('invalid settings are rejected before building', () => {
  const base = sample(), app = base.chapters[0].apps[0];
  const withApp = patch => ({ ...base, chapters: [{ ...base.chapters[0], apps: [{ ...app, ...patch }, ...base.chapters[0].apps.slice(1)] }, base.chapters[1]] });
  assert.throws(() => normalizeConfig(withApp({ free: { ...app.free, glyph: 'unicorn' } })), new RegExp('glyph must be one of ' + Object.keys(glyphs)[0]));
  assert.throws(() => normalizeConfig(withApp({ say: [] })), /say needs at least one line/);
  assert.throws(() => normalizeConfig(withApp({ say: [{ text: 'Loom.', mood: 'angry' }] })), /mood must be one of/);
  assert.throws(() => normalizeConfig(withApp({ chips: ['a', 'b', 'c', 'd', 'e'] })), /up to 4 features/);
  assert.throws(() => normalizeConfig({ ...base, outro: { ...base.outro, pick: 6 } }), /outro.pick/);
  assert.throws(() => normalizeConfig({ ...base, colors: { accent: 'lime' } }), /#RRGGBB/);
  assert.throws(() => normalizeConfig({ ...base, voice: { speaker: 'Sam; rm -rf /' } }), /voice.speaker/);
  assert.throws(() => build(withApp({ paid: { name: 'Loom', icon: '../prompt-recipe/assets/brand/youmind-mark.png' } }), { write: false }), /leaves the template/);
});
