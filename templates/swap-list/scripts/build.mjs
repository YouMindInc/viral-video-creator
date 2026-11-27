#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { imageTypes, audioTypes, videoTypes, esc, fixed, asset as resolve, normalizeVoice, lines, Narration, mixdown, caption, marked } from './voiceover.mjs';

export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(path.join(root, 'package.json'));
const asset = relative => resolve(root, relative);
export const moods = ['neutral', 'happy', 'wow', 'think'];

// Stroke icons for the free apps (24×24, drawn for this template).
export const glyphs = {
  screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m21 15-5-5L5 20"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  tasks: '<path d="m4 6 1.6 1.6L8.5 4.7M11 6.5h9M4 12l1.6 1.6 2.9-2.9M11 12.5h9M4 18l1.6 1.6 2.9-2.9M11 18.5h9"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>',
  pen: '<path d="m4 20 4-1 11-11-3-3L5 16z"/><path d="m14 7 3 3"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  wave: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10v4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
};
const monogramColors = ['#5B5BD6', '#E5484D', '#12A594', '#F76B15', '#3E63DD', '#8E4EC6', '#D6409F', '#0090FF'];

const defaults = {
  voice: { speaker: 'Samantha', rate: 185, gap: 0.12, volume: 1 },
  music: { file: '', volume: 0.12 },
  sfx: true,
  avatar: 'mascot',
  labels: { paid: 'PAID', free: 'FREE', openSource: 'OPEN SOURCE', freeOn: 'Free on GitHub', paidPrice: '$ / mo', swapPrice: '$$$ → $0', freePrice: '$0 / mo', chapter: 'CHAPTER', apps: 'apps' },
  hook: { title: ['Stop paying for', '{%n apps}'], say: '' },
  grid: { title: 'Every one is {free}', sticker: 'ALL FREE ON GITHUB', say: '' },
  chapters: [],
  outro: { title: ['Which one would you', '{swap first}?'], pick: 0, save: 'Save this', comment: '', say: '' },
  colors: { accent: '#D4F84A', paid: '#F08A3C', paper: '#E9EBEC', night: '#0C0C0D', ink: '#121212' }
};

function text(value, max, label, optional = false) {
  if (optional && (value === undefined || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(label + ' must be text up to ' + max + ' characters.');
  return value;
}
function image(value, label) {
  if (typeof value !== 'string' || !imageTypes.includes(path.extname(value).toLowerCase())) throw new Error(label + ' must be an image (.png, .svg, .jpg, .webp).');
  return value;
}

export function readConfig(file = path.join(root, 'template.json')) { return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8'))); }
export function normalizeConfig(input) {
  if (!input || typeof input !== 'object') throw new Error('template.json must be an object.');
  const c = { ...defaults, ...input, voice: { ...defaults.voice, ...input.voice }, music: { ...defaults.music, ...input.music },
    labels: { ...defaults.labels, ...input.labels }, hook: { ...defaults.hook, ...input.hook }, grid: { ...defaults.grid, ...input.grid },
    outro: { ...defaults.outro, ...input.outro }, colors: { ...defaults.colors, ...input.colors } };
  normalizeVoice(c.voice);
  if (c.music.file && !audioTypes.concat(videoTypes).includes(path.extname(c.music.file).toLowerCase())) throw new Error('music.file must be an audio file.');
  if (!Number.isFinite(c.music.volume) || c.music.volume < 0 || c.music.volume > 1) throw new Error('music.volume must be 0–1.');
  if (typeof c.sfx !== 'boolean') throw new Error('sfx must be true or false.');
  for (const color of Object.values(c.colors)) if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Colours must be #RRGGBB: ' + color);
  for (const [key, value] of Object.entries(c.labels)) text(value, 40, 'labels.' + key);

  if (c.avatar && c.avatar !== 'mascot') {
    const set = typeof c.avatar === 'string' ? { neutral: c.avatar } : c.avatar;
    if (typeof set !== 'object' || !set.neutral) throw new Error('avatar must be "mascot", "" (none), an image, or { "neutral": image, "happy": image, … }.');
    for (const [mood, file] of Object.entries(set)) { if (!moods.includes(mood)) throw new Error('avatar moods are ' + moods.join(', ') + '.'); image(file, 'avatar.' + mood); }
    c.avatar = set;
  }

  if (!Array.isArray(c.hook.title) || !c.hook.title.length || c.hook.title.length > 3) throw new Error('hook.title must be 1–3 lines.');
  c.hook.title.forEach((line, i) => text(line, 40, 'hook.title[' + i + ']'));
  c.hook.say = lines(c.hook.say, 'hook.say', moods);
  text(c.grid.title, 60, 'grid.title'); text(c.grid.sticker, 40, 'grid.sticker', true);
  c.grid.say = lines(c.grid.say, 'grid.say', moods);

  if (!Array.isArray(c.chapters) || !c.chapters.length || c.chapters.length > 4) throw new Error('chapters must list 1–4 chapters.');
  c.chapters = c.chapters.map((chapter, ci) => {
    const where = 'chapters[' + ci + ']';
    if (!Array.isArray(chapter.apps) || !chapter.apps.length || chapter.apps.length > 6) throw new Error(where + '.apps must list 1–6 apps.');
    return { name: text(chapter.name, 24, where + '.name'), say: lines(chapter.say, where + '.say', moods), apps: chapter.apps.map((app, ai) => {
      const at = where + '.apps[' + ai + ']';
      const paid = typeof app.paid === 'string' ? { name: app.paid } : { ...app.paid }, free = { ...app.free };
      text(paid.name, 24, at + '.paid.name'); if (paid.icon) image(paid.icon, at + '.paid.icon');
      if (paid.color !== undefined && !/^#[0-9a-f]{6}$/i.test(paid.color)) throw new Error(at + '.paid.color must be #RRGGBB.');
      text(free.name, 28, at + '.free.name'); text(free.url, 70, at + '.free.url', true); text(free.badge, 24, at + '.free.badge', true);
      if (free.icon) image(free.icon, at + '.free.icon');
      else if (!(free.glyph in glyphs)) throw new Error(at + '.free.glyph must be one of ' + Object.keys(glyphs).join(', ') + ' (or set free.icon).');
      const chips = app.chips || [];
      if (!Array.isArray(chips) || chips.length > 4) throw new Error(at + '.chips must list up to 4 features.');
      chips.forEach((chip, k) => text(chip, 26, at + '.chips[' + k + ']'));
      const say = lines(app.say, at + '.say', moods);
      if (!say.length) throw new Error(at + '.say needs at least one line (name the paid app, then the free one).');
      return { paid, free, chips, say };
    }) };
  });
  const count = c.chapters.reduce((sum, ch) => sum + ch.apps.length, 0);
  if (count < 2 || count > 12) throw new Error('List 2–12 apps in total (found ' + count + ').');

  if (!Array.isArray(c.outro.title) || !c.outro.title.length || c.outro.title.length > 2) throw new Error('outro.title must be 1–2 lines.');
  c.outro.title.forEach((line, i) => text(line, 40, 'outro.title[' + i + ']'));
  if (!Number.isInteger(c.outro.pick) || c.outro.pick < 0 || c.outro.pick >= count) throw new Error('outro.pick must be the index of one of the ' + count + ' apps.');
  text(c.outro.save, 24, 'outro.save', true); text(c.outro.comment, 40, 'outro.comment', true);
  c.outro.say = lines(c.outro.say, 'outro.say', moods);
  return c;
}

// Icons are background images: a timed clip should hold plain content, not nested <svg> or <img>.
const svgImage = (inner, color) => "url('data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + color
  + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>') + "')";
const picture = (cls, file) => '<span class="' + cls + ' picture" style="background-image:url(\'' + esc((asset(file), file)) + '\')"></span>';
function paidIcon(app, cls) {
  if (app.paid.icon) return picture(cls, app.paid.icon);
  const color = app.paid.color || monogramColors[app.n % monogramColors.length];
  return '<span class="' + cls + ' monogram" style="background:' + color + '">' + esc([...app.paid.name][0].toUpperCase()) + '</span>';
}
function freeIcon(app, cls, ink) {
  if (app.free.icon) return picture(cls, app.free.icon);
  return '<span class="' + cls + ' glyph" style="background-image:' + svgImage(glyphs[app.free.glyph], ink) + '"></span>';
}

// The bundled line-art mascot: one face per mood, swapped as the voice changes tone.
const mascotShapes = {
  shirt: 'M26 252C32 198 70 184 110 184s78 14 84 68Z',
  hair: 'M44 126C32 88 42 52 72 40c8-18 32-24 46-12 16-10 40-2 46 18 20 12 22 46 12 80-6-20-12-30-24-36-12 10-32 8-44-2-12 12-32 12-42 4-10 8-16 18-22 34Z',
  face: { cx: 110, cy: 118, rx: 64, ry: 70 }
};
const faces = {
  neutral: '<circle cx="84" cy="124" r="5"/><circle cx="136" cy="124" r="5"/><path class="ln" d="M70 96q14-7 28 0M122 96q14-7 28 0M96 160q14 10 28 0"/>',
  happy: '<path class="ln" d="M75 128q9-10 18 0M127 128q9-10 18 0M70 93q14-8 28 0M122 93q14-8 28 0"/><path d="M92 154q18 26 36 0Z"/>',
  wow: '<circle cx="84" cy="124" r="6.5"/><circle cx="136" cy="124" r="6.5"/><path class="ln" d="M70 86q14-9 28 0M122 86q14-9 28 0"/><ellipse cx="110" cy="164" rx="9" ry="12"/>',
  think: '<circle cx="80" cy="120" r="5"/><circle cx="132" cy="120" r="5"/><path class="ln" d="M70 98l28-3M122 90q14-9 28 2M98 164l24-5"/>'
};
function mascot() {
  const { cx, cy, rx, ry } = mascotShapes.face;
  return '<svg class="mascot" viewBox="0 0 220 256" aria-hidden="true">'
    + '<g fill="#FFFFFF" stroke="#FFFFFF" stroke-width="22" stroke-linejoin="round"><path d="' + mascotShapes.shirt + '"/><circle cx="46" cy="126" r="13"/><circle cx="174" cy="126" r="13"/>'
    + `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/><path d="${mascotShapes.hair}"/></g>`
    + '<path d="' + mascotShapes.shirt + '" fill="#161616"/><path d="M88 184q22 18 44 0" fill="none" stroke="#FFFFFF" stroke-width="5"/>'
    + '<g fill="#FFFFFF" stroke="#111111" stroke-width="5"><circle cx="46" cy="126" r="13"/><circle cx="174" cy="126" r="13"/>'
    + `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></g><path d="${mascotShapes.hair}" fill="#111111"/>`
    + '<path d="M78 52q10-8 20 0M118 40q10-8 20 0M146 62q8-4 14 4" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity=".45"/>'
    + '<g fill="none" stroke="#111111" stroke-width="5"><circle cx="84" cy="124" r="19"/><circle cx="136" cy="124" r="19"/><path d="M103 122q7-6 14 0"/></g>'
    + moods.map(m => '<g id="mood-' + m + '" class="mood"' + (m === 'neutral' ? '' : ' style="opacity:0"') + '>' + faces[m] + '</g>').join('')
    + '</svg>';
}
function avatarHtml(avatar) {
  if (!avatar) return '';
  if (avatar === 'mascot') return '<div id="avatar"><div id="avatar-body">' + mascot() + '</div></div>';
  return '<div id="avatar"><div id="avatar-body">' + moods.filter(m => avatar[m]).map(m => '<img id="mood-' + m + '" class="mood" src="' + esc((asset(avatar[m]), avatar[m])) + '" alt=""' + (m === 'neutral' ? '' : ' style="opacity:0"') + '>').join('') + '</div></div>';
}

// A few drifting specks over the whole video, placed by a fixed seed so every build looks the same.
function dust(count, colors) {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: count }, (_, i) => {
    const size = 6 + Math.round(rand() * 8);
    return '<i id="dust-' + i + '" class="speck" style="left:' + Math.round(rand() * 1040) + 'px;top:' + Math.round(220 + rand() * 1500) + 'px;width:' + size + 'px;height:' + size + 'px;background:' + colors[i % colors.length] + '"></i>';
  }).join('');
}

export function build(input = readConfig(), { write = true } = {}) {
  const config = normalizeConfig(input), L = config.labels;
  const apps = config.chapters.flatMap((chapter, ci) => chapter.apps.map((app, ai) => ({ ...app, chapter: ci, inChapter: ai }))).map((app, n) => ({ ...app, n }));
  const count = apps.length, two = n => String(n).padStart(2, '0'), fill = s => s.replaceAll('%n', String(count));
  const narration = new Narration(root, config.voice);
  const scenes = [], anims = [], moodChanges = [];
  const anim = (t, sel, kind, extra = {}) => anims.push({ t: Number(t.toFixed(3)), sel, kind, ...extra });
  const say = (list, theme, fallback) => list.map((line, i) => {
    const entry = narration.say(line, { theme, scene: scenes.length });
    const mood = line.mood || fallback[Math.min(i, fallback.length - 1)];
    moodChanges.push({ t: entry.start, mood: config.avatar === 'mascot' || config.avatar[mood] ? mood : 'neutral' });
    if (config.avatar) anim(entry.start, '#avatar-body', 'nod');
    return entry;
  });
  // Close the scene after its last line (plus a beat), or after the minimum it needs to read.
  const scene = (kind, theme, start, spoken, { tail = 0.3, min = 0 } = {}) => {
    const end = Math.max(spoken.length ? spoken.at(-1).end + tail : start, start + min);
    narration.t = end;
    return { id: 's' + scenes.length, kind, theme, start, end };
  };
  // Scene content is spans: a timed clip should hold plain content, not nested block elements.
  const tileGrid = (cls, inner) => '<span class="box ' + cls + '">' + apps.map(inner).join('') + '</span>';
  const rows = Math.ceil(count / 3);

  { // Hook: dark, the headline builds line by line over a wall of paid apps.
    const id = 's0', start = narration.t; narration.wait(0.15);
    const spoken = say(config.hook.say, 'dark', ['wow']);
    const s = scene('hook', 'dark', start, spoken, { min: 2.2 });
    const span = (spoken.length ? spoken.at(-1).end : start + 1.6) - start;
    const html = config.hook.title.map((line, i) => {
      const accent = /^\{.*\}$/.test(fill(line).trim());
      anim(start + 0.05 + i * span * 0.3, '#' + id + '-l' + i, i === config.hook.title.length - 1 && i > 0 && !accent ? 'blur' : accent ? 'pop' : 'rise');
      return '<span id="' + id + '-l' + i + '" class="box hook-line hook-l' + i + (accent ? ' accent' : '') + '">' + marked(fill(line).replace(/^\{(.*)\}$/, '$1'), 'hl-text') + '</span>';
    }).join('') + tileGrid('hook-tiles rows-' + rows, (app, j) => {
      anim(start + 0.25 + j * 0.06, '#' + id + '-t' + j, 'drop');
      return '<span id="' + id + '-t' + j + '" class="hook-tile">' + paidIcon(app, 'icon') + '<span class="tag paid-tag">' + esc(L.paid) + '</span></span>';
    });
    narration.sound('whoosh', start + 0.2);
    scenes.push({ ...s, html });
  }

  { // Grid: light, every tile flips from PAID to FREE while the line plays.
    const start = narration.t, id = 's' + scenes.length; narration.wait(0.1);
    const spoken = say(config.grid.say, 'light', ['happy']);
    const s = scene('grid', 'light', start, spoken, { min: 2.6, tail: 0.5 });
    const flipFrom = spoken.length ? spoken[0].start + spoken[0].seconds * 0.35 : start + 0.8, flipTo = (spoken.length ? spoken.at(-1).end : s.end - 0.6) - 0.1;
    anim(start + 0.02, '#' + id + '-title', 'rise');
    let html = '<span id="' + id + '-title" class="box grid-title">' + marked(config.grid.title) + '</span>' + tileGrid('grid-tiles rows-' + rows, (app, j) => {
      anim(start + 0.08 + j * 0.05, '#' + id + '-t' + j, 'pop');
      const at = flipFrom + (flipTo - flipFrom) * j / Math.max(1, count - 1);
      anim(at, '#' + id + '-p' + j, 'hide'); anim(at, '#' + id + '-f' + j, 'pop');
      if (j % 3 === 0) narration.sound('tick', at);
      return '<span id="' + id + '-t' + j + '" class="grid-tile">' + paidIcon(app, 'icon') + '<span class="name">' + esc(app.paid.name) + '</span>'
        + '<span id="' + id + '-p' + j + '" class="tag paid-tag">' + esc(L.paid) + '</span><span id="' + id + '-f' + j + '" class="tag free-tag">' + esc(L.free) + '</span></span>';
    });
    if (config.grid.sticker) {
      anim(flipTo + 0.1, '#' + id + '-sticker', 'stamp', { r: -4 }); narration.sound('thud', flipTo + 0.16);
      html += '<span id="' + id + '-sticker" class="box sticker" style="top:' + (390 + rows * 222 + 60) + 'px">' + esc(config.grid.sticker) + '</span>';
    }
    scenes.push({ ...s, html });
  }

  let appIndex = 0;
  config.chapters.forEach((chapter, ci) => {
    if (config.chapters.length > 1 || chapter.say.length) { // Chapter card: dark, number, name and the apps it covers.
      const start = narration.t, id = 's' + scenes.length; narration.wait(0.1);
      const spoken = say(chapter.say, 'dark', ['neutral']);
      const s = scene('chapter', 'dark', start, spoken, { min: 1.8, tail: 0.35 });
      anim(start + 0.02, '#' + id + '-num', 'pop'); anim(start + 0.12, '#' + id + '-name', 'rise'); anim(start + 0.22, '#' + id + '-sub', 'fade');
      narration.sound('whoosh', start);
      const icons = apps.filter(app => app.chapter === ci).map((app, k) => {
        anim(start + 0.35 + k * Math.min(0.35, (s.end - start - 0.8) / chapter.apps.length), '#' + id + '-i' + k, 'pop');
        return '<span id="' + id + '-i' + k + '" class="ch-icon">' + paidIcon(app, 'icon') + '</span>';
      }).join('');
      scenes.push({ ...s, html: '<span id="' + id + '-num" class="box ch-num">' + two(ci + 1) + '</span><span id="' + id + '-name" class="box ch-name">' + esc(chapter.name) + '</span>'
        + '<span id="' + id + '-sub" class="box ch-sub">' + esc(L.chapter) + ' ' + two(ci + 1) + ' / ' + two(config.chapters.length) + ' · ' + chapter.apps.length + ' ' + esc(L.apps) + '</span><span class="box ch-icons">' + icons + '</span>' });
    }
    apps.filter(app => app.chapter === ci).forEach((app, ai) => { // Swap card: the paid app is struck out and the free one is typed in, feature by feature.
      const n = appIndex++, start = narration.t, id = 's' + scenes.length; narration.wait(0.2);
      const spoken = say(app.say, 'light', ['think', 'happy', 'neutral', 'wow']);
      const first = spoken[0], reveal = spoken[1] ? spoken[1].start : first.start + first.seconds * 0.55, extra = spoken.slice(2);
      anim(start + 0.02, '#' + id + '-bar', 'drop'); narration.sound('whoosh', start);
      anim(reveal, '#' + id + '-strike', 'strike'); anim(reveal, '#' + id + '-bar', 'dim');
      anim(reveal, '#' + id + '-price-a', 'hide'); anim(reveal, '#' + id + '-price-b', 'fade');
      anim(reveal, '#' + id + '-label', 'rise'); anim(reveal + 0.05, '#' + id + '-card', 'pop'); narration.sound('pop', reveal + 0.05);
      anim(reveal + 0.18, '#' + id + '-icon', 'pop');
      const typing = Math.min(0.7, 0.05 * [...app.free.name].length + 0.15);
      anim(reveal + 0.25, '#' + id + '-name', 'type', { d: typing, n: [...app.free.name].length });
      anim(reveal + 0.25, '#' + id + '-cursor', 'fade'); anim(reveal + 0.25 + typing + 0.35, '#' + id + '-cursor', 'hide');
      narration.sound('type', reveal + 0.25);
      anim(reveal + 0.45, '#' + id + '-url', 'fade'); anim(reveal + 0.55, '#' + id + '-pill-a', 'pop'); anim(reveal + 0.65, '#' + id + '-pill-b', 'pop');
      // Features land across the lines after the reveal (or one after another when there are none).
      const chipTimes = app.chips.map((_, j) => {
        if (!extra.length) return reveal + 0.95 + j * 0.4;
        const pos = (j + 0.25) * extra.length / app.chips.length, li = Math.min(extra.length - 1, Math.floor(pos));
        return Math.max(reveal + 0.8, extra[li].start + extra[li].seconds * Math.min(0.8, pos - li));
      });
      chipTimes.forEach((t, j) => { anim(t, '#' + id + '-c' + j, 'pop'); narration.sound('pop', t, 0.7); });
      const lastLine = spoken.at(-1).end, stampAt = Math.max(reveal + 0.9, (chipTimes.at(-1) ?? reveal) + 0.45, lastLine - 0.3);
      anim(stampAt, '#' + id + '-stamp', 'stamp', { r: -6 }); narration.sound('thud', stampAt + 0.06);
      anim(stampAt, '#' + id + '-sq' + n, 'done');
      const s = scene('swap', 'light', start, spoken, { tail: 0.35, min: stampAt + 0.6 - start });
      const squares = apps.map((_, k) => '<i id="' + id + '-sq' + k + '" class="sq' + (k < n ? ' done' : k === n ? ' now' : '') + '"></i>').join('');
      scenes.push({ ...s, html: '<span class="box progress"><span>' + (n + 1) + '/' + count + '</span>' + squares + '</span>'
        + '<span class="box chapter-pill">' + esc(config.chapters[ci].name) + ' · ' + (ai + 1) + '/' + config.chapters[ci].apps.length + '</span>'
        + '<span id="' + id + '-bar" class="box paid-bar"><span class="tag paid-tag">' + esc(L.paid) + '</span>' + paidIcon(app, 'icon')
        + '<span class="paid-name">' + esc(app.paid.name) + '<i id="' + id + '-strike" class="strike"></i></span>'
        + '<span class="price"><span id="' + id + '-price-a">' + esc(L.paidPrice) + '</span><span id="' + id + '-price-b" class="price-b">' + esc(L.swapPrice) + '</span></span></span>'
        + '<span id="' + id + '-label" class="box free-label"><i>↓</i>' + esc(L.freeOn) + '</span>'
        + '<span id="' + id + '-card" class="box free-card"><span class="free-head">' + freeIcon(app, 'free-icon', config.colors.ink).replace('class="free-icon', 'id="' + id + '-icon" class="free-icon')
        + '<span class="free-meta"><span class="free-name"><span id="' + id + '-name" class="typed">' + esc(app.free.name) + '</span><i id="' + id + '-cursor" class="cursor"></i></span>'
        + '<span id="' + id + '-url" class="free-url">' + esc(app.free.url || '') + '</span></span></span>'
        + '<span class="pills"><span id="' + id + '-pill-a" class="pill os"><i></i>' + esc(app.free.badge || L.openSource) + '</span><span id="' + id + '-pill-b" class="pill cost">' + esc(L.freePrice) + '</span></span>'
        + (app.chips.length ? '<span class="chips">' + app.chips.map((chip, j) => '<span id="' + id + '-c' + j + '" class="chip">' + esc(chip) + '</span>').join('') + '</span>' : '')
        + '<span id="' + id + '-stamp" class="free-stamp">' + esc(L.free) + '</span></span>' });
    });
  });

  { // Outro: every swap at a glance, the favourite highlighted, then save + comment.
    const start = narration.t, id = 's' + scenes.length, o = config.outro; narration.wait(0.15);
    const spoken = say(o.say, 'light', ['happy', 'happy']);
    const ask = spoken[0], invite = spoken[1] || spoken[0];
    o.title.forEach((_, i) => anim(start + 0.02 + i * 0.22, '#' + id + '-t' + i, i ? 'pop' : 'rise'));
    const pickAt = ask ? ask.start + ask.seconds * 0.6 : start + 1;
    anim(pickAt, '#' + id + '-ring', 'pop'); narration.sound('pop', pickAt);
    const saveAt = invite && invite !== ask ? invite.start : pickAt + 0.5;
    const typeAt = saveAt + (invite ? invite.seconds * 0.35 : 0.6), typing = Math.min(1, 0.04 * [...o.comment].length + 0.2), postAt = typeAt + typing + 0.35;
    if (o.save) { anim(saveAt, '#' + id + '-save', 'pop'); narration.sound('pop', saveAt); }
    if (o.comment) {
      anim(saveAt + 0.12, '#' + id + '-box', 'rise');
      anim(typeAt, '#' + id + '-placeholder', 'hide'); anim(typeAt, '#' + id + '-typed', 'type', { d: typing, n: [...o.comment].length }); narration.sound('type', typeAt);
      anim(postAt, '#' + id + '-typed', 'hide'); anim(postAt, '#' + id + '-placeholder', 'fade'); anim(postAt, '#' + id + '-bubble', 'pop'); narration.sound('ding', postAt);
      for (let h = 0; h < 4; h++) anim(postAt + 0.1 + h * 0.16, '#' + id + '-h' + h, 'float');
    }
    const s = scene('outro', 'light', start, spoken, { tail: 0.9, min: (o.comment ? postAt + 1.4 : pickAt + 1.6) - start });
    const top = 450 + rows * 192 + (rows - 1) * 22 + 50;
    const title = o.title.map((line, i) => '<span id="' + id + '-t' + i + '" class="box out-title out-t' + i + '">' + marked(line) + '</span>').join('');
    const mini = tileGrid('mini-tiles', (app, j) => {
      anim(start + 0.3 + j * 0.06, '#' + id + '-m' + j, 'pop');
      return '<span id="' + id + '-m' + j + '" class="mini-tile' + (j === o.pick ? ' pick' : '') + '"><span class="swap">' + paidIcon(app, 'old') + '<b>→</b>' + freeIcon(app, 'new', config.colors.ink) + '</span><span class="name">' + esc(app.free.name) + '</span>'
        + (j === o.pick ? '<i id="' + id + '-ring" class="ring"></i>' : '') + '</span>';
    });
    const hearts = [0, 1, 2, 3].map(h => '<i id="' + id + '-h' + h + '" class="heart" style="left:' + (880 + h * 34 - (h % 2) * 60) + 'px;top:' + (top + 90) + ';background-image:' + svgImage('<path d="M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9Z" fill="' + (h % 2 ? config.colors.paid : '#FF5C7A') + '" stroke="none"/>', 'none') + '"></i>').join('');
    scenes.push({ ...s, html: title + mini
      + (o.save ? '<span id="' + id + '-save" class="box save" style="top:' + top + 'px"><i class="save-icon" style="background-image:' + svgImage('<path d="M6 3h12v18l-6-4-6 4z" fill="' + config.colors.ink + '"/>', config.colors.ink) + '"></i>' + esc(o.save) + '</span>' : '')
      + (o.comment ? '<span id="' + id + '-box" class="box comment-box" style="top:' + top + 'px"><span class="you">You</span><span class="field"><span id="' + id + '-placeholder" class="placeholder">Add a comment…</span><span id="' + id + '-typed" class="draft">' + esc(o.comment) + '</span></span><span class="post">Post</span></span>'
        + '<span id="' + id + '-bubble" class="box bubble" style="top:' + (top + 128) + 'px">' + esc(o.comment) + '</span>' + hearts : '') });
  }

  const duration = scenes.at(-1).end;
  // Captions: each line stays up until the next one starts (or its scene ends).
  const spoken = narration.spoken, reveals = [];
  const captions = spoken.map((entry, i) => {
    const next = spoken[i + 1], sceneEnd = scenes[entry.scene].end;
    const end = next && next.scene === entry.scene ? next.start : sceneEnd;
    const cap = caption('cap' + i, entry);
    reveals.push(...cap.reveals);
    return '<div id="cap' + i + '" class="cap clip on-' + entry.theme + '" data-start="' + fixed(entry.start) + '" data-duration="' + fixed(end - entry.start) + '" data-track-index="3">' + cap.html + '</div>';
  });
  const changes = moodChanges.filter((m, i) => m.mood !== (i ? moodChanges[i - 1].mood : 'neutral'));
  const mix = mixdown(narration, duration, { sfx: config.sfx, music: config.music });
  const plan = { duration, anims, reveals, moods: config.avatar ? changes.map(m => ({ t: Number(m.t.toFixed(3)), mood: m.mood })) : [], accent: config.colors.accent };
  const tokens = {
    DURATION: fixed(duration), PLAN: JSON.stringify(plan),
    ACCENT: config.colors.accent, PAID: config.colors.paid, PAPER: config.colors.paper, NIGHT: config.colors.night, INK: config.colors.ink,
    SCENES: scenes.map(s => '    <div id="' + s.id + '" class="scene ' + s.theme + ' ' + s.kind + ' clip" data-start="' + fixed(s.start) + '" data-duration="' + fixed(s.end - s.start) + '" data-track-index="1"><span class="floor"></span>' + s.html + '</div>').join('\n'),
    CAPTIONS: captions.join('\n'), AVATAR: avatarHtml(config.avatar), DUST: dust(14, [config.colors.accent, '#B9BEC2', config.colors.accent, '#FFFFFF']),
    AUDIO: mix ? '<audio id="soundtrack" class="clip" src="' + esc(mix) + '" data-start="0" data-duration="' + fixed(duration) + '" data-track-index="5" data-volume="1" preload="auto"></audio>' : ''
  };
  const html = fs.readFileSync(path.join(root, 'scripts/swap-list.html'), 'utf8').replace(/\{\{([A-Z_]+)\}\}/g, (_, name) => {
    if (!(name in tokens)) throw new Error('Unknown template field ' + name); return String(tokens[name]);
  });
  const metadata = { duration, width: 1080, height: 1920, apps: count, scenes: scenes.map(s => ({ kind: s.kind, start: s.start, end: s.end })), lines: spoken.length, soundtrack: mix };
  if (!write) return { config, metadata, html };
  fs.mkdirSync(path.join(root, 'assets/vendor'), { recursive: true });
  fs.copyFileSync(require.resolve('gsap/dist/gsap.min.js'), path.join(root, 'assets/vendor/gsap.min.js'));
  fs.writeFileSync(path.join(root, 'index.html.tmp'), html);
  fs.renameSync(path.join(root, 'index.html.tmp'), path.join(root, 'index.html'));
  console.log('Built swap-list: ' + duration.toFixed(2) + 's, ' + count + ' apps, ' + scenes.length + ' scenes, ' + spoken.length + ' voice lines.');
  return { config, metadata, html };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { config: { type: 'string' } } });
    if ((positionals[0] || 'build') !== 'build') throw new Error('Usage: node scripts/build.mjs [build] [--config file.json]');
    build(readConfig(values.config ? path.resolve(values.config) : undefined));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
