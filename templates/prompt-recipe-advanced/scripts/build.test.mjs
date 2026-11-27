import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { root, readConfig, normalizeConfig, build } from './build.mjs';

const sample = () => JSON.parse(fs.readFileSync(path.join(root, 'template.json'), 'utf8'));

test('the bundled samples build in both layouts with an end card and a voice line', () => {
  const tall = build(readConfig(), { write: false });
  assert.equal(tall.metadata.layout, 'tall');
  const wide = build(readConfig(path.join(root, 'examples/wide.json')), { write: false });
  assert.equal(wide.metadata.layout, 'wide');
  for (const { html, metadata } of [tall, wide]) {
    assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
    assert.ok(metadata.voice && fs.existsSync(path.join(root, metadata.voice.file)), 'voice line is generated and cached');
    assert.match(html, /<span id="end-name" class="box">YouMind<\/span>/);
  }
});

test('the end card follows the clip and lasts as long as the voice needs', () => {
  const { metadata, html } = build(readConfig(), { write: false });
  const { resultEnd, end, voice, duration } = metadata;
  assert.equal(end.start, resultEnd);
  assert.ok(Math.abs(voice.start - (resultEnd + 0.45)) < 1e-9);
  assert.ok(end.length >= voice.seconds + 0.45 + 0.7 - 1e-9 && end.length >= 2.8);
  assert.ok(Math.abs(duration - (resultEnd + end.length)) < 1e-9);
  assert.ok(end.keywordAt > voice.start && end.keywordAt < voice.start + voice.seconds, 'keyword pulse lands inside the voice line');
  assert.match(html, new RegExp('<div id="end-card" class="clip" data-start="' + resultEnd.toFixed(6).replace(/0+$/, '') ));
  assert.match(html, /#result \{ overflow: hidden; background: #000 url\('assets\/stills\/[0-9a-f]{16}\.jpg'\)/);
});

test('without an end card the voice closes over the clip and nothing is appended', () => {
  const { metadata, html } = build({ ...sample(), endCard: { enabled: false } }, { write: false });
  assert.equal(metadata.end, null);
  assert.equal(metadata.duration, metadata.resultEnd);
  assert.ok(Math.abs(metadata.voice.start + metadata.voice.seconds + 0.3 - metadata.resultEnd) < 1e-6);
  assert.doesNotMatch(html, /id="end-card"/);
});

test('reference corners, the badge and the comment line follow the settings', () => {
  const { html } = build({ ...sample(), reference: { ...sample().reference, radius: 12 }, cta: 'Say {<hi>} & go' }, { write: false });
  assert.match(html, /#reference \{ overflow: hidden; background: #FFFFFF; border-radius: 12px; \}/);
  assert.match(html, /<img src="assets\/brand\/youmind-mark\.png" alt=""><span>YouMind<\/span>/);
  assert.match(html, /Say <span class="kw">&lt;hi&gt;<\/span> &amp; go/);
});

test('invalid settings are rejected before building', () => {
  assert.throws(() => normalizeConfig({ ...sample(), reference: { radius: -1 } }), /radius/);
  assert.throws(() => normalizeConfig({ ...sample(), voice: { rate: 10 } }), /voice.rate/);
  assert.throws(() => normalizeConfig({ ...sample(), voice: { speaker: 'Sam; rm -rf /' } }), /voice.speaker/);
  assert.throws(() => normalizeConfig({ ...sample(), voice: { file: 'line.txt' } }), /voice.file/);
  assert.throws(() => normalizeConfig({ ...sample(), endCard: { icon: 'icon.gif' } }), /endCard.icon/);
  assert.throws(() => build({ ...sample(), result: '../prompt-recipe/assets/sample/giant-kitten.mp4' }, { write: false }), /leaves the template/);
});
