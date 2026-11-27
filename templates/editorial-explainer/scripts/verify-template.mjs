import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { readConfig, normalizeConfig, cropFor, build, fingerprint, asset, digest, probe } from './hyperframes-project.mjs';
import { handler, resolvePublicPath } from './template-editor.mjs';
const config = readConfig();
const originalHash = digest('index.html');
const result = build(config, false, { write: false });
const sourceInfo = probe(asset(config.persona.source));
assert.equal(result.metadata.duration, sourceInfo.seconds);
function timeline(html, duration, hasAudio = true) {
  assert.equal((html.match(/<audio\b/g) || []).length, hasAudio ? 1 : 0, 'source narration audio is used exactly once');
  const tracks = new Map();
  for (const tag of html.matchAll(/<(?:video|audio|img|div)\b[^>]*data-track-index="\d+"[^>]*>/g)) {
    const attr = name => tag[0].match(new RegExp(name + '="([^"]*)"'))?.[1];
    const start = Number(attr('data-start')), length = Number(attr('data-duration')), track = attr('data-track-index');
    assert.ok(start >= 0 && length > 0 && start + length <= duration + .00001, 'media stays within episode');
    if (tag[0].startsWith('<video')) assert.match(tag[0], /muted playsinline/, 'visual videos must stay muted');
    const items = tracks.get(track) || []; items.push([start, start + length]); tracks.set(track, items);
  }
  for (const items of tracks.values()) {
    items.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < items.length; i++) assert.ok(items[i][0] >= items[i - 1][1] - .00001, 'same-track clips do not overlap');
  }
}
timeline(result.html, sourceInfo.seconds, sourceInfo.hasAudio);
if (result.metadata.personaMode === 'sam2') {
  assert.ok(!result.html.includes('id="persona-scene"'), 'SAM2 already contains the rounded scene; do not duplicate it');
  assert.match(result.html, /id="persona-overlay"/);
}
const changedLayout = structuredClone(config); changedLayout.layout.captions.y -= 10;
assert.equal(fingerprint(config, 'sam2'), fingerprint(changedLayout, 'sam2'), 'subtitle position does not invalidate segmentation');
changedLayout.persona.sceneTop += 10;
assert.notEqual(fingerprint(config, 'sam2'), fingerprint(changedLayout, 'sam2'), 'background framing changes invalidate the SAM2 layer');
const replacement = structuredClone(config);
replacement.persona.source = config.persona.source === 'source/free-skills-share.mp4' ? 'source/character-talking.mp4' : 'source/free-skills-share.mp4'; replacement.persona.cropY = 450; replacement.captions = ''; replacement.fallbackCaption = '<new speaker>';
const replaced = build(replacement, false, { write: false });
assert.equal(replaced.metadata.personaMode, 'original', 'new footage cannot reuse the previous speaker cutout');
assert.equal(replaced.metadata.duration, probe(asset(replacement.persona.source)).seconds);
assert.equal(replaced.metadata.captions.length, 1);
assert.ok(replaced.html.includes('&lt;new speaker&gt;'), 'caption content is escaped');
assert.ok(!replaced.html.includes('id="persona-overlay"'));
timeline(replaced.html, replaced.metadata.duration);
assert.equal(cropFor({ width: 1920, height: 1080 }, { cropY: 0 }).height, 640, 'landscape footage can fill the crop');
assert.throws(() => cropFor({ width: 1920, height: 1080 }, { cropY: 450 }));
const bad = structuredClone(config); bad.layout.visual.x = 1081;
assert.throws(() => normalizeConfig(bad), /超出/);
assert.throws(() => asset('../outside.mp4'));
assert.throws(() => resolvePublicPath('/editor/../../../sam2/README.md'));
assert.throws(() => resolvePublicPath('/.git/config'));
async function request(method, url, body, extraHeaders = {}) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]);
  Object.assign(req, { method, url, headers: { host: 'localhost:3018', 'content-type': 'application/json', ...extraHeaders } });
  const res = new EventEmitter();
  res.writeHead = code => { res.status = code; res.headersSent = true; };
  res.end = data => { res.body = JSON.parse(String(data)); };
  await handler(req, res); return res;
}
assert.equal((await request('GET', '/api/state')).body.appId, 'news-channel-template-editor');
assert.equal((await request('POST', '/api/save', config, { origin: 'https://example.com' })).status, 403);
assert.equal((await request('POST', '/api/save', bad)).status, 400);
assert.equal((await request('POST', '/api/upload?kind=persona&name=bad.js', {})).status, 400);
assert.equal(digest('index.html'), originalHash, 'validation and rejected requests do not alter the saved composition');
for (const file of ['editor/index.html', 'editor/editor.js', 'editor/editor.css', 'editor/layout-preview.js']) assert.ok(fs.statSync(file).size > 100);
console.log('PASS: SAM2 layering, source replacement, duration/audio sync, captions, framing, path isolation and local editor requests.');
