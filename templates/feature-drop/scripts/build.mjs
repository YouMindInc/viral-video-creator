#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { imageTypes, audioTypes, videoTypes, esc, fixed, asset as resolve, probe, normalizeVoice, lines, Narration, mixdown, caption, marked } from './voiceover.mjs';

export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(path.join(root, 'package.json'));
const asset = relative => resolve(root, relative);
export const sceneTypes = ['hook', 'reveal', 'count', 'feature', 'teaser', 'rank', 'steps', 'cta'];
export const panelKinds = ['media', 'list', 'timeline', 'board', 'week', 'terminal'];

const defaults = {
  voice: { speaker: 'Samantha', rate: 185, gap: 0.14, volume: 1 },
  music: { file: '', volume: 0.12 },
  sfx: true,
  scenes: [],
  colors: { accent: '#F26A2E', accent2: '#FF9A57', go: '#3DDC84', bg: '#0C0807', glow: '#5A2410', ink: '#F4EEE9', muted: '#8E7E76' }
};

function text(value, max, label, optional = false) {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(label + ' must be text up to ' + max + ' characters.');
  return value;
}
function list(value, min, max, label) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(label + ' must list ' + min + '–' + max + ' items.');
  return value;
}
function media(value, label) {
  if (typeof value !== 'string' || ![...imageTypes, ...videoTypes].includes(path.extname(value).toLowerCase())) throw new Error(label + ' must be an image or a video.');
  return value;
}

// Scene and panel fields: what each one needs, checked up front so a bad config fails before any speech is generated.
function normalizePanel(p, where) {
  if (!p || !panelKinds.includes(p.kind)) throw new Error(where + '.kind must be one of ' + panelKinds.join(', ') + '.');
  const q = { ...p };
  if (p.kind === 'media') { media(p.src, where + '.src'); q.fit = p.fit || 'cover'; if (!['cover', 'contain'].includes(q.fit)) throw new Error(where + '.fit must be cover or contain.'); }
  if (p.kind === 'list' || p.kind === 'timeline' || p.kind === 'board' || p.kind === 'week') { text(p.title, 40, where + '.title', true); text(p.meta, 30, where + '.meta', true); }
  if (p.kind === 'list') {
    q.rows = list(p.rows, 2, 6, where + '.rows').map((r, i) => { const row = typeof r === 'string' ? { text: r } : r; text(row.text, 40, where + '.rows[' + i + '].text'); text(row.value, 12, where + '.rows[' + i + '].value', true); return row; });
    if (p.highlight !== undefined && (!Number.isInteger(p.highlight) || p.highlight < 0 || p.highlight >= q.rows.length)) throw new Error(where + '.highlight must be a row index.');
  }
  if (p.kind === 'timeline') list(p.rows, 2, 6, where + '.rows').forEach((r, i) => { text(r.time, 10, where + '.rows[' + i + '].time'); text(r.text, 44, where + '.rows[' + i + '].text'); });
  if (p.kind === 'board') {
    list(p.columns, 2, 4, where + '.columns').forEach((c, i) => { text(c.title, 14, where + '.columns[' + i + '].title'); list(c.cards, 0, 3, where + '.columns[' + i + '].cards').forEach((card, k) => text(typeof card === 'string' ? card : card.text, 40, where + '.columns[' + i + '].cards[' + k + ']')); });
    if (p.reply) { text(p.reply.text, 60, where + '.reply.text'); text(p.reply.label, 30, where + '.reply.label', true); }
  }
  if (p.kind === 'week') {
    q.days = p.days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    list(q.days, 7, 7, where + '.days');
    list(p.blocks, 1, 14, where + '.blocks').forEach((b, i) => {
      if (!Number.isInteger(b.day) || b.day < 0 || b.day > 6 || !Number.isInteger(b.row ?? 0) || (b.row ?? 0) < 0 || (b.row ?? 0) > 3) throw new Error(where + '.blocks[' + i + '] needs day 0–6 and row 0–3.');
      text(b.text, 16, where + '.blocks[' + i + '].text');
    });
    text(p.done, 30, where + '.done', true);
  }
  if (p.kind === 'terminal') normalizeTerminal(p, where);
  return q;
}
function normalizeTerminal(t, where) {
  text(t.title, 50, where + '.title', true);
  list(t.lines, 1, 6, where + '.lines').forEach((l, i) => {
    const line = typeof l === 'string' ? { text: l } : l;
    text(line.text, 60, where + '.lines[' + i + '].text');
    if (line.kind && !['cmd', 'out', 'ok', 'dim'].includes(line.kind)) throw new Error(where + '.lines[' + i + '].kind must be cmd, out, ok or dim.');
  });
  list(t.cards || [], 0, 2, where + '.cards').forEach((c, i) => { text(c.text, 90, where + '.cards[' + i + '].text'); text(c.label, 24, where + '.cards[' + i + '].label', true); text(c.score, 12, where + '.cards[' + i + '].score', true); });
}

export function readConfig(file = path.join(root, 'template.json')) { return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8'))); }
export function normalizeConfig(input) {
  if (!input || typeof input !== 'object') throw new Error('template.json must be an object.');
  const c = { ...defaults, ...input, voice: { ...defaults.voice, ...input.voice }, music: { ...defaults.music, ...input.music }, colors: { ...defaults.colors, ...input.colors } };
  normalizeVoice(c.voice);
  if (c.music.file && !audioTypes.concat(videoTypes).includes(path.extname(c.music.file).toLowerCase())) throw new Error('music.file must be an audio file.');
  if (!Number.isFinite(c.music.volume) || c.music.volume < 0 || c.music.volume > 1) throw new Error('music.volume must be 0–1.');
  if (typeof c.sfx !== 'boolean') throw new Error('sfx must be true or false.');
  for (const color of Object.values(c.colors)) if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Colours must be #RRGGBB: ' + color);
  list(c.scenes, 2, 24, 'scenes');
  c.scenes = c.scenes.map((s, i) => {
    const where = 'scenes[' + i + '] (' + s?.type + ')';
    if (!s || !sceneTypes.includes(s.type)) throw new Error('scenes[' + i + '].type must be one of ' + sceneTypes.join(', ') + '.');
    const q = { ...s, say: lines(s.say, where + '.say') };
    if (s.type === 'hook') { text(s.tag, 30, where + '.tag', true); text(s.subject, 20, where + '.subject'); text(s.kicker, 20, where + '.kicker', true); text(s.verb, 16, where + '.verb'); text(s.target, 24, where + '.target'); }
    if (s.type === 'reveal') { text(s.title, 40, where + '.title'); if (s.media) media(s.media, where + '.media'); list(s.stats || [], 0, 3, where + '.stats').forEach((v, k) => text(v, 22, where + '.stats[' + k + ']')); }
    if (s.type === 'count') {
      text(s.stamp, 16, where + '.stamp', true); text(s.label, 16, where + '.label');
      if (!Number.isInteger(s.number) || s.number < 1 || s.number > 999) throw new Error(where + '.number must be a whole number 1–999.');
      list(s.chips || [], 0, 12, where + '.chips').forEach((v, k) => text(v, 22, where + '.chips[' + k + ']'));
    }
    if (s.type === 'feature') { text(s.title, 20, where + '.title'); text(s.tag, 24, where + '.tag', true); q.panel = normalizePanel(s.panel, where + '.panel'); }
    if (s.type === 'teaser') { text(s.kicker, 30, where + '.kicker', true); list(s.lines, 1, 2, where + '.lines').forEach((v, k) => text(v, 16, where + '.lines[' + k + ']')); text(s.tag, 24, where + '.tag', true); }
    if (s.type === 'rank') {
      text(s.title, 40, where + '.title'); text(s.meta, 40, where + '.meta', true);
      list(s.rows, 1, 4, where + '.rows').forEach((r, k) => { text(r.value, 10, where + '.rows[' + k + '].value'); text(r.title, 44, where + '.rows[' + k + '].title'); text(r.by, 40, where + '.rows[' + k + '].by', true); text(r.badge, 24, where + '.rows[' + k + '].badge', true); });
    }
    if (s.type === 'steps') { text(s.title, 30, where + '.title'); list(s.steps, 2, 4, where + '.steps').forEach((v, k) => text(v, 18, where + '.steps[' + k + ']')); if (s.media) media(s.media, where + '.media'); normalizeTerminal(s.terminal || {}, where + '.terminal'); text(s.done, 16, where + '.done', true); }
    if (s.type === 'cta') { text(s.comment, 16, where + '.comment'); text(s.keyword, 20, where + '.keyword'); text(s.line, 60, where + '.line', true); text(s.note, 40, where + '.note', true); text(s.placeholder, 30, where + '.placeholder', true); }
    return q;
  });
  return c;
}

// Media sits behind a span as a background image; videos become their own top-level clip over the same box
// (a timed scene may not hold a nested <video>).
function mediaBox(src, cls, style, scene, videos, fit = 'cover') {
  asset(src);
  if (imageTypes.includes(path.extname(src).toLowerCase())) return '<span class="' + cls + '" style="' + style + ';background-image:url(\'' + esc(src) + '\');background-size:' + fit + '"></span>';
  videos.push({ src, style, fit, scene });
  return '<span class="' + cls + '" style="' + style + '"></span>';
}

export function build(input = readConfig(), { write = true } = {}) {
  const config = normalizeConfig(input);
  const narration = new Narration(root, config.voice);
  const scenes = [], anims = [], videos = [];
  const anim = (t, sel, kind, extra = {}) => anims.push({ t: Number(t.toFixed(3)), sel, kind, ...extra });
  // Spread n events across [from, to].
  const spread = (n, from, to) => Array.from({ length: n }, (_, i) => n === 1 ? from : from + (to - from) * i / (n - 1));
  let featureNumber = 0;

  config.scenes.forEach((s, index) => {
    const id = 's' + index, start = narration.t;
    narration.wait(index === 0 ? 0.15 : 0.25);
    const spoken = s.say.map(line => narration.say(line, { scene: index }));
    const talkEnd = spoken.length ? spoken.at(-1).end : start + 2;
    const body = spoken.length ? [spoken[0].start, Math.max(spoken[0].start + 0.6, talkEnd - 0.35)] : [start + 0.4, start + 1.8];
    let html = '', min = 2, tail = 0.35;
    const two = n => String(n).padStart(2, '0');

    if (s.type === 'hook') {
      if (s.tag) { html += '<span id="' + id + '-tag" class="box h-tag"><i></i>' + esc(s.tag) + '</span>'; anim(start + 0.02, '#' + id + '-tag', 'fade'); }
      html += '<span id="' + id + '-subject" class="box h-subject">' + esc(s.subject) + '</span>';
      if (s.kicker) html += '<span id="' + id + '-kicker" class="box h-kicker">' + esc(s.kicker) + '</span>';
      html += '<span id="' + id + '-verb" class="box h-verb grad">' + esc(s.verb) + '</span>'
        + '<span class="box h-target-row"><span id="' + id + '-target" class="h-target">' + esc(s.target) + '</span></span><i id="' + id + '-slash" class="box h-slash"></i>';
      const [a, b] = body;
      anim(start + 0.05, '#' + id + '-subject', 'rise');
      if (s.kicker) anim(a + (b - a) * 0.2, '#' + id + '-kicker', 'pop');
      anim(a + (b - a) * 0.35, '#' + id + '-verb', 'stamp', { r: 0 }); narration.sound('thud', a + (b - a) * 0.35 + 0.2);
      anim(a + (b - a) * 0.6, '#' + id + '-target', 'drop'); anim(a + (b - a) * 0.6 + 0.3, '#' + id + '-slash', 'strike'); narration.sound('whoosh', a + (b - a) * 0.6 + 0.25);
      min = 2.4;
    }

    if (s.type === 'reveal') {
      html += '<span id="' + id + '-title" class="box r-title">' + marked(s.title, 'acc') + '</span>';
      if (s.media) html += mediaBox(s.media, 'box r-media', 'left:60px;top:360px;width:960px;height:560px', index, videos).replace('class="box r-media"', 'id="' + id + '-media" class="box r-media"');
      html += '<span class="box r-stats">' + (s.stats || []).map((v, k) => '<span id="' + id + '-st' + k + '" class="stat">' + esc(v) + '</span>').join('') + '</span>';
      anim(start + 0.02, '#' + id + '-title', 'rise');
      if (s.media) { anim(start + 0.15, '#' + id + '-media', 'pop'); narration.sound('whoosh', start + 0.1); }
      spread((s.stats || []).length, body[0] + 0.3, body[1]).forEach((t, k) => { anim(t, '#' + id + '-st' + k, 'pop'); narration.sound('pop', t, 0.7); });
    }

    if (s.type === 'count') {
      if (s.stamp) html += '<span class="box k-stamp-row"><span id="' + id + '-stamp" class="k-stamp">' + esc(s.stamp) + '</span></span>';
      html += '<span class="box k-head"><span id="' + id + '-num" class="k-num grad">' + s.number + '</span><span id="' + id + '-label" class="k-label">' + esc(s.label) + '</span></span>'
        + '<span class="box k-chips">' + (s.chips || []).map((v, k) => {
          const [, n, rest] = /^(\d+)\s+(.*)$/.exec(v) || [, '', v];
          return '<span id="' + id + '-c' + k + '" class="k-chip">' + (n ? '<b>' + esc(n) + '</b>' : '') + esc(rest) + '</span>';
        }).join('') + '</span>';
      if (s.stamp) { anim(start + 0.05, '#' + id + '-stamp', 'stamp', { r: -6 }); narration.sound('thud', start + 0.25); }
      anim(body[0], '#' + id + '-num', 'count', { to: s.number }); anim(body[0], '#' + id + '-label', 'rise');
      spread((s.chips || []).length, body[0] + 0.4, body[1]).forEach((t, k) => { anim(t, '#' + id + '-c' + k, 'pop'); if (k % 2 === 0) narration.sound('tick', t); });
    }

    if (s.type === 'feature') {
      const n = ++featureNumber, p = s.panel;
      html += '<span id="' + id + '-num" class="box f-num grad">' + two(n) + '</span><span id="' + id + '-title" class="box f-title">' + esc(s.title) + '</span>'
        + (s.tag ? '<span id="' + id + '-tag" class="box f-tag">' + esc(s.tag) + '</span>' : '');
      anim(start + 0.02, '#' + id + '-num', 'pop'); anim(start + 0.1, '#' + id + '-title', 'rise'); if (s.tag) anim(start + 0.2, '#' + id + '-tag', 'fade');
      narration.sound('whoosh', start);
      html += panel(p, id, index, body, start);
      min = 2.6; tail = 0.45;
    }

    if (s.type === 'teaser') {
      if (s.kicker) html += '<span id="' + id + '-kicker" class="box x-kicker">' + esc(s.kicker) + '</span>';
      html += s.lines.map((line, k) => '<span id="' + id + '-l' + k + '" class="box x-line x-l' + k + '">' + marked(line, 'grad') + '</span>').join('')
        + (s.tag ? '<span id="' + id + '-tag" class="box x-tag">' + esc(s.tag) + '</span>' : '');
      if (s.kicker) anim(start + 0.05, '#' + id + '-kicker', 'fade');
      spread(s.lines.length, body[0] + (body[1] - body[0]) * 0.4, body[1]).forEach((t, k) => { anim(t, '#' + id + '-l' + k, 'pop'); narration.sound('thud', t + 0.1, 0.8); });
      if (s.tag) anim(body[1], '#' + id + '-tag', 'rise');
    }

    if (s.type === 'rank') {
      html += '<span id="' + id + '-title" class="box rk-title">' + marked(s.title, 'acc') + '</span>'
        + '<span class="box rk-list">' + (s.meta ? '<span id="' + id + '-meta" class="rk-meta">' + esc(s.meta) + '</span>' : '')
        + s.rows.map((r, k) => '<span id="' + id + '-r' + k + '" class="rk-row' + (k ? '' : ' top') + '"><span class="v grad">' + esc(r.value) + '</span><span class="rk-text"><span class="t">' + esc(r.title) + '</span>'
          + (r.by ? '<span class="by">' + esc(r.by) + '</span>' : '') + (r.badge ? '<span id="' + id + '-b' + k + '" class="badge">' + esc(r.badge) + '</span>' : '') + '</span></span>').join('') + '</span>';
      anim(start + 0.02, '#' + id + '-title', 'rise'); if (s.meta) anim(start + 0.15, '#' + id + '-meta', 'fade');
      spread(s.rows.length, body[0] + 0.25, body[1] - 0.2).forEach((t, k) => { anim(t, '#' + id + '-r' + k, 'slide'); narration.sound('pop', t, 0.6); if (s.rows[k].badge) anim(t + 0.3, '#' + id + '-b' + k, 'pop'); });
    }

    if (s.type === 'steps') {
      html += '<span id="' + id + '-title" class="box st-title">' + marked(s.title, 'acc') + '</span><span class="box st-pills">'
        + s.steps.map((v, k) => '<span id="' + id + '-p' + k + '" class="step"><i>' + (k + 1) + '</i>' + esc(v) + '</span>').join('') + '</span>';
      const termTop = s.media ? 760 : 440;
      if (s.media) html += mediaBox(s.media, 'box st-media', 'left:60px;top:430px;width:960px;height:300px', index, videos).replace('class="box st-media"', 'id="' + id + '-media" class="box st-media"');
      anim(start + 0.02, '#' + id + '-title', 'rise');
      // Each step lights up as its line starts (or evenly when there are fewer lines than steps).
      const stepTimes = s.steps.map((_, k) => spoken.length >= s.steps.length + 1 ? spoken[k + 1].start : spoken.length >= s.steps.length ? spoken[k].start : body[0] + (body[1] - body[0]) * k / s.steps.length);
      stepTimes.forEach((t, k) => { anim(t, '#' + id + '-p' + k, 'on'); narration.sound('tick', t); });
      if (s.media) anim(start + 0.2, '#' + id + '-media', 'pop');
      html += terminal(s.terminal, id, 'box st-term', 'top:' + termTop + 'px;height:' + (1160 - termTop) + 'px', [start + 0.3, Math.max(start + 1.2, talkEnd - 0.3)]);
      if (s.done) { const at = talkEnd - 0.1; html += '<span id="' + id + '-done" class="box st-done">✓ ' + esc(s.done) + '</span>'; anim(at, '#' + id + '-done', 'stamp', { r: -5 }); narration.sound('ding', at + 0.15); }
      min = 3; tail = 0.6;
    }

    if (s.type === 'cta') {
      const key = s.keyword, typeAt = body[0] + (body[1] - body[0]) * 0.45, typing = Math.min(0.8, 0.06 * [...key].length + 0.2), sendAt = typeAt + typing + 0.3;
      html += '<span id="' + id + '-comment" class="box c-comment">' + esc(s.comment) + '</span><span class="box c-key-row"><span id="' + id + '-key" class="c-key">“' + esc(key) + '”</span></span>'
        + (s.line ? '<span id="' + id + '-line" class="box c-line">' + esc(s.line) + '</span>' : '')
        + '<span id="' + id + '-input" class="box c-input"><i class="c-bubble"></i><span class="field"><span id="' + id + '-ph" class="placeholder">' + esc(s.placeholder || 'Add a comment…') + '</span>'
        + '<span id="' + id + '-draft" class="draft">' + esc(key) + '</span></span><span id="' + id + '-send" class="c-send"><i></i></span></span>'
        + (s.note ? '<span id="' + id + '-note" class="box c-note">' + esc(s.note) + '</span>' : '')
        + [0, 1, 2, 3].map(h => '<i id="' + id + '-h' + h + '" class="heart" style="left:' + (900 - h * 46) + 'px;top:' + (930 - (h % 2) * 30) + 'px"></i>').join('');
      anim(start + 0.02, '#' + id + '-comment', 'rise');
      anim(body[0] + (body[1] - body[0]) * 0.15, '#' + id + '-key', 'stamp', { r: -3 }); narration.sound('thud', body[0] + (body[1] - body[0]) * 0.15 + 0.2);
      if (s.line) anim(body[0] + (body[1] - body[0]) * 0.3, '#' + id + '-line', 'fade');
      anim(body[0] + 0.2, '#' + id + '-input', 'rise');
      anim(typeAt, '#' + id + '-ph', 'hide'); anim(typeAt, '#' + id + '-draft', 'type', { d: typing, n: [...key].length }); narration.sound('type', typeAt);
      anim(sendAt, '#' + id + '-send', 'press'); anim(sendAt + 0.15, '#' + id + '-draft', 'hide'); anim(sendAt + 0.15, '#' + id + '-ph', 'fade'); narration.sound('ding', sendAt);
      for (let h = 0; h < 4; h++) anim(sendAt + 0.1 + h * 0.15, '#' + id + '-h' + h, 'float');
      if (s.note) anim(sendAt + 0.3, '#' + id + '-note', 'rise');
      min = sendAt + 1.5 - start; tail = 1;
    }

    const end = Math.max(spoken.length ? talkEnd + tail : start + min, start + min);
    narration.t = end;
    scenes.push({ id, type: s.type, start, end, html });
  });

  function panel(p, id, index, [a, b], start) {
    const box = 'box panel p-' + p.kind, pid = id + '-panel';
    anim(start + 0.15, '#' + pid, 'pop');
    const head = (p.title || p.meta) ? '<span class="p-head"><span>' + esc(p.title || '') + '</span><b>' + esc(p.meta || '') + '</b></span>' : '';
    if (p.kind === 'media') return mediaBox(p.src, box, 'left:60px;top:440px;width:960px;height:720px', index, videos, p.fit).replace('class="' + box + '"', 'id="' + pid + '" class="' + box + '"');
    if (p.kind === 'terminal') return terminal(p, id, box, 'top:440px;height:720px', [a, b]).replace('class="' + box + '"', 'id="' + pid + '" class="' + box + '"');
    let inner = '';
    if (p.kind === 'list') {
      inner = p.rows.map((r, k) => '<span id="' + id + '-r' + k + '" class="l-row"><i>' + String(k + 1).padStart(2, '0') + '</i>' + esc(r.text) + (r.value ? '<span class="v">' + esc(r.value) + '</span>' : '') + '</span>').join('');
      spread(p.rows.length, a + 0.1, a + (b - a) * 0.55).forEach((t, k) => anim(t, '#' + id + '-r' + k, 'slide'));
      if (p.highlight !== undefined) { anim(a + (b - a) * 0.75, '#' + id + '-r' + p.highlight, 'mark'); narration.sound('pop', a + (b - a) * 0.75); }
    }
    if (p.kind === 'timeline') {
      inner = p.rows.map((r, k) => '<span id="' + id + '-r' + k + '" class="t-row' + (r.cut ? ' cut' : '') + '"><span class="t-time">' + esc(r.time) + '</span><span class="t-text">' + esc(r.text)
        + (r.cut ? '<i id="' + id + '-x' + k + '" class="t-strike"></i>' : '') + '</span></span>').join('');
      let seed = 11; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      inner += '<span id="' + id + '-wave" class="t-wave">' + Array.from({ length: 56 }, (_, k) => '<i style="height:' + Math.round(14 + rand() * 76) + 'px"' + (k % 13 === 6 ? ' class="mark"' : '') + '></i>').join('') + '</span>';
      const times = spread(p.rows.length, a + 0.1, a + (b - a) * 0.7);
      times.forEach((t, k) => { anim(t, '#' + id + '-r' + k, 'slide'); if (p.rows[k].cut) { anim(t + 0.35, '#' + id + '-x' + k, 'strike'); narration.sound('tick', t + 0.35); } });
      anim(a + 0.2, '#' + id + '-wave', 'fade');
    }
    if (p.kind === 'board') {
      const cards = p.columns.flatMap((c, ci) => c.cards.map((card, k) => ({ ci, k })));
      const times = spread(cards.length, a + 0.2, a + (b - a) * (p.reply ? 0.6 : 0.9));
      inner = '<span class="b-cols" style="grid-template-columns:repeat(' + p.columns.length + ',1fr)">' + p.columns.map((c, ci) => '<span class="b-col"><span class="b-title">' + esc(c.title) + '</span>'
        + c.cards.map((card, k) => { const v = typeof card === 'string' ? { text: card } : card; return '<span id="' + id + '-c' + ci + '-' + k + '" class="b-card">' + (v.who ? '<b>' + esc(v.who) + '</b>' : '') + esc(v.text) + '</span>'; }).join('')
        + '<span id="' + id + '-n' + ci + '" class="b-count">' + c.cards.length + '</span></span>').join('') + '</span>';
      cards.forEach(({ ci, k }, j) => { anim(times[j], '#' + id + '-c' + ci + '-' + k, 'drop'); narration.sound('pop', times[j], 0.5); });
      p.columns.forEach((c, ci) => { const last = cards.map((x, j) => x.ci === ci ? times[j] : null).filter(t => t !== null).at(-1) ?? a + 0.2; anim(last + 0.2, '#' + id + '-n' + ci, 'pop'); });
      if (p.reply) {
        const at = a + (b - a) * 0.68, typing = Math.min(1.2, 0.035 * [...p.reply.text].length + 0.2);
        inner += '<span id="' + id + '-reply" class="b-reply"><span class="b-reply-label">↳ ' + esc(p.reply.label || 'Reply') + '</span><span class="b-reply-text"><span id="' + id + '-rt" class="typed">' + esc(p.reply.text) + '</span></span></span>';
        anim(at, '#' + id + '-reply', 'rise'); anim(at + 0.2, '#' + id + '-rt', 'type', { d: typing, n: [...p.reply.text].length }); narration.sound('type', at + 0.2);
      }
    }
    if (p.kind === 'week') {
      inner = '<span class="w-grid">' + p.days.map((d, di) => '<span class="w-day"><span class="w-name">' + esc(d) + '</span>'
        + p.blocks.map((blk, k) => blk.day === di ? '<span id="' + id + '-w' + k + '" class="w-block' + (blk.hot ? ' hot' : '') + '" style="grid-row:' + ((blk.row || 0) + 2) + '">' + esc(blk.text) + '</span>' : '').join('') + '</span>').join('') + '</span>';
      const order = p.blocks.map((blk, k) => ({ k, key: blk.day * 10 + (blk.row || 0) })).sort((x, y) => x.key - y.key);
      const times = spread(order.length, a + 0.2, a + (b - a) * (p.done ? 0.75 : 0.95));
      order.forEach(({ k }, j) => { anim(times[j], '#' + id + '-w' + k, 'drop'); narration.sound('tick', times[j], 0.8); });
      if (p.done) { inner += '<span id="' + id + '-done" class="w-done">✓ ' + esc(p.done) + '</span>'; anim(b, '#' + id + '-done', 'pop'); narration.sound('ding', b); }
    }
    return '<span id="' + pid + '" class="' + box + '" style="left:60px;top:440px;width:960px;height:720px">' + head + inner + '</span>';
  }

  function terminal(t, id, cls, style, [a, b]) {
    const linesHtml = t.lines.map((l, k) => { const line = typeof l === 'string' ? { text: l } : l; return '<span class="tl tl-' + (line.kind || 'out') + '"><span id="' + id + '-tl' + k + '" class="typed">' + esc(line.text) + '</span></span>'; }).join('');
    const cards = (t.cards || []).map((c, k) => '<span id="' + id + '-tc' + k + '" class="term-card' + (c.best ? ' best' : '') + '"><span class="tc-head"><span>' + esc(c.label || '') + '</span><b>' + esc(c.score || '') + '</b></span><span class="tc-text">' + esc(c.text) + '</span></span>').join('');
    const slots = t.lines.length + (t.cards || []).length, times = spread(slots, a + 0.2, b - 0.2);
    t.lines.forEach((l, k) => { const n = [...(typeof l === 'string' ? l : l.text)].length; anim(times[k], '#' + id + '-tl' + k, 'type', { d: Math.min(0.9, 0.025 * n + 0.15), n }); if ((typeof l === 'string' ? 'out' : l.kind) === 'cmd') narration.sound('type', times[k]); });
    (t.cards || []).forEach((_, k) => { anim(times[t.lines.length + k], '#' + id + '-tc' + k, 'rise'); narration.sound('pop', times[t.lines.length + k], 0.6); });
    return '<span class="' + cls + '" style="left:60px;width:960px;' + style + '"><span class="term-bar"><i></i><i></i><i></i><span>' + esc(t.title || 'Terminal') + '</span></span><span class="term-body">' + linesHtml + cards + '</span></span>';
  }

  const duration = scenes.at(-1).end, spoken = narration.spoken, reveals = [];
  const captions = spoken.map((entry, i) => {
    const next = spoken[i + 1], end = next && next.scene === entry.scene ? next.start : scenes[entry.scene].end;
    const cap = caption('cap' + i, entry);
    reveals.push(...cap.reveals);
    return '<div id="cap' + i + '" class="cap clip" data-start="' + fixed(entry.start) + '" data-duration="' + fixed(end - entry.start) + '" data-track-index="3">' + cap.html + '</div>';
  });
  const clips = videos.map((v, k) => {
    const sc = scenes[v.scene], seconds = probe(asset(v.src)).seconds, length = Math.min(sc.end - sc.start, seconds);
    return '<video id="media-' + k + '" class="clip media-video" src="' + esc(v.src) + '" style="' + v.style + ';object-fit:' + v.fit + '" data-start="' + fixed(sc.start) + '" data-duration="' + fixed(length) + '" data-track-index="2" muted playsinline preload="auto"></video>';
  });
  const mix = mixdown(narration, duration, { sfx: config.sfx, music: config.music });
  let seed = 3; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const dust = Array.from({ length: 16 }, (_, i) => { const size = 4 + Math.round(rand() * 7); return '<i class="speck" style="left:' + Math.round(rand() * 1060) + 'px;top:' + Math.round(160 + rand() * 1600) + 'px;width:' + size + 'px;height:' + size + 'px;background:' + (i % 3 ? config.colors.accent2 : '#FFFFFF') + '"></i>'; }).join('');
  const plan = { duration, anims, reveals, accent: config.colors.accent, accent2: config.colors.accent2 };
  const c = config.colors;
  const tokens = {
    DURATION: fixed(duration), PLAN: JSON.stringify(plan), ACCENT: c.accent, ACCENT2: c.accent2, GO: c.go, BG: c.bg, GLOW: c.glow, INK: c.ink, MUTED: c.muted,
    SCENES: scenes.map(s => '    <div id="' + s.id + '" class="scene ' + s.type + ' clip" data-start="' + fixed(s.start) + '" data-duration="' + fixed(s.end - s.start) + '" data-track-index="1"><span class="floor"></span>' + s.html + '</div>').join('\n'),
    VIDEOS: clips.join('\n'), CAPTIONS: captions.join('\n'), DUST: dust,
    AUDIO: mix ? '<audio id="soundtrack" class="clip" src="' + esc(mix) + '" data-start="0" data-duration="' + fixed(duration) + '" data-track-index="5" data-volume="1" preload="auto"></audio>' : ''
  };
  const html = fs.readFileSync(path.join(root, 'scripts/feature-drop.html'), 'utf8').replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, name) => {
    if (!(name in tokens)) throw new Error('Unknown template field ' + name); return String(tokens[name]);
  });
  const metadata = { duration, width: 1080, height: 1920, scenes: scenes.map(s => ({ type: s.type, start: s.start, end: s.end })), lines: spoken.length, features: featureNumber, videos: videos.length, soundtrack: mix };
  if (!write) return { config, metadata, html };
  fs.mkdirSync(path.join(root, 'assets/vendor'), { recursive: true });
  fs.copyFileSync(require.resolve('gsap/dist/gsap.min.js'), path.join(root, 'assets/vendor/gsap.min.js'));
  fs.writeFileSync(path.join(root, 'index.html.tmp'), html);
  fs.renameSync(path.join(root, 'index.html.tmp'), path.join(root, 'index.html'));
  console.log('Built feature-drop: ' + duration.toFixed(2) + 's, ' + scenes.length + ' scenes (' + scenes.map(s => s.type).join(' → ') + '), ' + spoken.length + ' voice lines.');
  return { config, metadata, html };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { config: { type: 'string' } } });
    if ((positionals[0] || 'build') !== 'build') throw new Error('Usage: node scripts/build.mjs [build] [--config file.json]');
    build(readConfig(values.config ? path.resolve(values.config) : undefined));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
