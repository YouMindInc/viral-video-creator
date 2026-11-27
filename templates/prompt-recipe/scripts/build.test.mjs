import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { root, readConfig, normalizeConfig, build } from './build.mjs';

const sample = () => JSON.parse(fs.readFileSync(path.join(root, 'template.json'), 'utf8'));

test('the bundled samples build in both layouts', () => {
  const tall = build(readConfig(), { write: false });
  assert.equal(tall.metadata.layout, 'tall');
  assert.equal(tall.metadata.audio, true);
  const wide = build(readConfig(path.join(root, 'examples/wide.json')), { write: false });
  assert.equal(wide.metadata.layout, 'wide');
  assert.equal(wide.metadata.audio, false);
  for (const { html } of [tall, wide]) assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
});

test('layout can be forced and duration trimmed', () => {
  const { metadata } = build({ ...sample(), layout: 'wide', duration: 5 }, { write: false });
  assert.equal(metadata.layout, 'wide');
  assert.equal(metadata.duration, 5);
  assert.throws(() => build({ ...sample(), duration: 60 }, { write: false }), /longer than the result/);
});

test('prompt text is escaped and split into paragraphs', () => {
  const { html } = build({ ...sample(), prompt: { title: 'Prompt', text: 'one <script>\n\ntwo & three' } }, { write: false });
  assert.match(html, /<p>one &lt;script&gt;<\/p><p>two &amp; three<\/p>/);
});

test('the badge uses the YouMind mark by default and can fall back to the sparkle', () => {
  const { model, ...rest } = sample();
  assert.match(build(rest, { write: false }).html, /<img src="assets\/brand\/youmind-mark\.png" alt=""><span>YouMind<\/span>/);
  const sparkle = build({ ...sample(), model: { name: 'Studio', icon: 'sparkle', colors: ['#111111', '#222222'] } }, { write: false }).html;
  assert.match(sparkle, /<stop offset="1" stop-color="#222222"\/>.*<span>Studio<\/span>/s);
  assert.throws(() => normalizeConfig({ ...sample(), model: { icon: 'logo.gif' } }), /model.icon/);
});

test('the call to action marks the braced keyword and can be left out', () => {
  const { html } = build(readConfig(), { write: false });
  assert.match(html, /<div id="cta" class="box"><span class="cta-line">Comment <span class="kw">skill<\/span> to get the Giant Kitten generation prompt in one click<\/span><\/div>/);
  assert.match(build({ ...sample(), cta: 'Say {<hi>} & go' }, { write: false }).html, /Say <span class="kw">&lt;hi&gt;<\/span> &amp; go/);
  assert.match(build({ ...sample(), cta: '' }, { write: false }).html, /<div id="cta" class="box"><\/div>/);
  assert.throws(() => normalizeConfig({ ...sample(), cta: 'x'.repeat(141) }), /cta/);
});

test('invalid settings are rejected before building', () => {
  assert.throws(() => normalizeConfig({ ...sample(), layout: 'square' }), /layout/);
  assert.throws(() => normalizeConfig({ ...sample(), prompt: { text: '' } }), /prompt.text/);
  assert.throws(() => normalizeConfig({ ...sample(), colors: { top: 'peach' } }), /#RRGGBB/);
  assert.throws(() => build({ ...sample(), result: '/tmp/outside.mp4' }, { write: false }), /relative/);
  assert.throws(() => build({ ...sample(), result: '../editorial-explainer/source/character-talking.mp4' }, { write: false }), /leaves the template/);
});
