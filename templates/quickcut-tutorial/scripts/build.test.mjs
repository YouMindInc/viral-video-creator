import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { root, sceneTypes, readConfig, normalizeConfig, parseWords, segmentsFor, groupCaptions, build } from './build.mjs';

const sample = () => JSON.parse(fs.readFileSync(path.join(root, 'template.json'), 'utf8'));

test('the bundled sample builds with captions, a CTA and no nested timed media', () => {
  const { metadata, html } = build(readConfig(), { write: false });
  assert.equal(metadata.segments[0].type, 'inset');
  assert.equal(metadata.segments.at(-1).type, 'cta');
  assert.equal(metadata.segments.at(-1).end, metadata.duration);
  assert.ok(metadata.captions > 20);
  assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
  assert.match(html, /COMMENT<\/span><span id="cta-keyword-\d+" class="cta-keyword">“ SKILL ”/);
  assert.doesNotMatch(html, /class="seg /); // Scenes are flat: each video is its own top-level clip.
});

test('every scene type renders', () => {
  const media = 'assets/sample/screen.mp4';
  const scenes = sceneTypes.map((type, i) => ({ type, start: i * 2, end: i * 2 + 2, media,
    ...(type === 'title' ? { lines: ['one', { text: 'two', color: 'green', size: 'l' }] } : {}), ...(type === 'cta' ? { keyword: 'GO' } : {}) }));
  const { metadata } = build({ ...sample(), scenes }, { write: false });
  assert.deepEqual(metadata.segments.map(s => s.type), [...sceneTypes, 'face']); // The A-roll outlasts the scenes, so it ends on the face.
});

test('SRT words carry timing, highlights and forced breaks', () => {
  const words = parseWords('1\n00:00:00,000 --> 00:00:00,000\n\n\n2\n00:00:01,000 --> 00:00:02,000\ngo to *ChatGPT*\n\n3\n00:00:02,000 --> 00:00:03,000\nthen | type');
  assert.deepEqual(words.map(w => w.text), ['go', 'to', 'ChatGPT', 'then', 'type']);
  assert.equal(words[2].highlight, true);
  assert.equal(words[4].breakBefore, true);
  assert.ok(Math.abs(words[2].end - 2) < 1e-9);
});

test('gaps between scenes become face shots and captions follow the scene style', () => {
  const segments = segmentsFor([{ type: 'broll', start: 1, end: 2 }, { type: 'title', start: 2, end: 3 }], 4);
  assert.deepEqual(segments.map(s => [s.type, s.start, s.end]), [['face', 0, 1], ['broll', 1, 2], ['title', 2, 3], ['face', 3, 4]]);
  assert.equal(segments[3].punch, true);
  const words = ['a', 'b', 'c', 'd', 'e', 'f'].map((text, i) => ({ text, start: i * 0.6, end: i * 0.6 + 0.5 }));
  const beats = groupCaptions(words, segments, { maxWords: 4, highlight: ['A'] });
  assert.deepEqual(beats.map(b => [b.style, b.words.map(w => w.text).join('')]), [['kinetic', 'ab'], ['italic', 'cd'], ['kinetic', 'f']]);
  assert.equal(beats[0].words[0].highlight, true);
  assert.ok(beats.every((b, i) => !beats[i + 1] || b.end <= beats[i + 1].start));
});

test('invalid scenes are rejected', () => {
  const base = sample();
  assert.throws(() => normalizeConfig({ ...base, scenes: [{ type: 'zoom', start: 0, end: 1 }] }), /type must be/);
  assert.throws(() => normalizeConfig({ ...base, scenes: [{ type: 'broll', start: 0, end: 1 }] }), /needs media/);
  assert.throws(() => normalizeConfig({ ...base, scenes: [{ type: 'face', start: 0, end: 2 }, { type: 'face', start: 1, end: 3 }] }), /overlap/);
  assert.throws(() => normalizeConfig({ ...base, scenes: [{ type: 'cta', start: 0, end: 1 }] }), /keyword/);
  assert.throws(() => normalizeConfig({ ...base, scenes: [{ type: 'title', start: 0, end: 1, lines: [{ text: 'x', color: 'mauve' }] }] }), /color/);
  assert.throws(() => build({ ...base, aroll: '../editorial-explainer/source/character-talking.mp4' }, { write: false }), /leaves the template/);
});
