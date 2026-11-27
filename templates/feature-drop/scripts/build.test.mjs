import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { root, sceneTypes, panelKinds, readConfig, normalizeConfig, build } from './build.mjs';

const sample = () => JSON.parse(fs.readFileSync(path.join(root, 'template.json'), 'utf8'));
const sceneBodies = html => [...html.matchAll(/<div id="s\d+" class="scene[^"]*clip"[^>]*>([\s\S]*?)<\/div>\n/g)].map(m => m[1]);

test('the bundled sample uses every scene type and panel kind, back to back', () => {
  const { metadata, html, config } = build(readConfig(), { write: false });
  assert.deepEqual([...new Set(metadata.scenes.map(s => s.type))].sort(), [...sceneTypes].sort());
  const kinds = new Set([...config.scenes.filter(s => s.panel).map(s => s.panel.kind), ...config.scenes.filter(s => s.terminal).map(() => 'terminal')]);
  assert.deepEqual([...kinds].sort(), [...panelKinds].sort());
  metadata.scenes.forEach((s, i) => assert.ok(i === 0 || Math.abs(s.start - metadata.scenes[i - 1].end) < 1e-9));
  assert.equal(metadata.features, 5);
  assert.equal((html.match(/class="cap clip/g) || []).length, metadata.lines);
  assert.ok(fs.existsSync(path.join(root, metadata.soundtrack)));
  assert.doesNotMatch(html, /\{\{[A-Z0-9_]+\}\}/);
  assert.match(html, /<span id="s\d+-num" class="box f-num grad">05<\/span>/);
  assert.match(html, /<span id="s\d+-key" class="c-key">“VIDEO”<\/span>/);
});

test('scenes hold plain spans only, so HyperFrames keeps one timeline row per scene', () => {
  for (const body of sceneBodies(build(readConfig(), { write: false }).html)) assert.doesNotMatch(body, /<(div|svg|img|video)\b/);
});

test('steps light up with their lines and the panels animate inside the spoken time', () => {
  const { metadata, html } = build(readConfig(), { write: false });
  const plan = JSON.parse(/var plan = (\{.*\});/.exec(html)[1]);
  const steps = metadata.scenes.find(s => s.type === 'steps');
  const on = plan.anims.filter(a => a.kind === 'on');
  assert.equal(on.length, 3);
  assert.ok(on.every((a, i) => a.t > steps.start && a.t < steps.end && (!i || a.t > on[i - 1].t)));
  for (const a of plan.anims) {
    const scene = metadata.scenes.find(s => a.t >= s.start - 1e-6 && a.t < s.end);
    assert.ok(scene, a.sel + ' at ' + a.t + 's falls inside a scene');
  }
});

test('a video panel becomes its own top-level clip over the panel box', () => {
  const base = sample();
  base.scenes[3].panel = { kind: 'media', src: 'assets/sample/demo.mp4' };
  const demo = path.join(root, 'assets/sample/demo.mp4');
  if (!fs.existsSync(demo)) fs.copyFileSync(path.join(root, '../prompt-recipe/assets/sample/giant-kitten.mp4'), demo);
  try {
    const { html, metadata } = build(base, { write: false });
    assert.equal(metadata.videos, 1);
    assert.match(html, /<video id="media-0" class="clip media-video" src="assets\/sample\/demo\.mp4" style="left:60px;top:440px;width:960px;height:720px;object-fit:cover" data-start="[\d.]+"/);
    for (const body of sceneBodies(html)) assert.doesNotMatch(body, /<video\b/);
  } finally { fs.rmSync(demo, { force: true }); }
});

test('invalid settings are rejected before building', () => {
  const base = sample(), at = (i, patch) => ({ ...base, scenes: base.scenes.map((s, k) => k === i ? { ...s, ...patch } : s) });
  assert.throws(() => normalizeConfig(at(0, { type: 'intro' })), /type must be one of/);
  assert.throws(() => normalizeConfig(at(3, { panel: { kind: 'chart' } })), /kind must be one of/);
  assert.throws(() => normalizeConfig(at(5, { panel: { ...base.scenes[5].panel, highlight: 9 } })), /highlight must be a row index/);
  assert.throws(() => normalizeConfig(at(7, { panel: { kind: 'week', blocks: [{ day: 7, text: 'x' }] } })), /day 0–6/);
  assert.throws(() => normalizeConfig(at(2, { number: 0 })), /number must be/);
  assert.throws(() => normalizeConfig(at(11, { keyword: '' })), /keyword/);
  assert.throws(() => normalizeConfig({ ...base, scenes: base.scenes.slice(0, 1) }), /scenes must list 2–24/);
  assert.throws(() => build(at(1, { media: '../prompt-recipe/assets/sample/kitten-reference.jpg' }), { write: false }), /leaves the template/);
});
