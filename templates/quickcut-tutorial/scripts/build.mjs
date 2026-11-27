#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveWhisperModel } from '../../../scripts/runtime-paths.mjs';

export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(path.join(root, 'package.json'));
export const hf = path.join(path.dirname(require.resolve('hyperframes/package.json')), 'bin/hyperframes.mjs');
export const sceneTypes = ['face', 'split', 'broll', 'phone', 'card', 'inset', 'bubble', 'title', 'cta'];
const needsMedia = ['split', 'broll', 'phone', 'card', 'inset', 'bubble'];
const imageTypes = ['.jpg', '.jpeg', '.png', '.webp'], videoTypes = ['.mp4', '.mov', '.m4v', '.webm'];
// Default caption look and vertical position per scene type, measured from the reference posts.
const captionDefaults = {
  face: ['kinetic', 1390], split: ['italic', 704], broll: ['italic', 1560], phone: ['italic', 1650], card: ['italic', 1250],
  inset: ['italic', 1500], bubble: ['kinetic', 1240], title: ['none', 0], cta: ['none', 0]
};
const defaults = {
  captions: '', captionWords: 4, highlight: [], music: '', musicVolume: 0.12, punchIn: 1.12, faceFocus: 35, splitAt: 786,
  profile: null, scenes: [],
  colors: { accent: '#FFE81A', divider: '#FFE81A', green: '#3BE03F', red: '#F23B45', pink: '#F7A6F0', orange: '#FF9F1C', white: '#FFFFFF', phone: '#F3A291' }
};
export const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const fixed = value => Number(value).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
const hex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const bare = word => word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

export function asset(relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('Media paths must be relative to templates/quickcut-tutorial: ' + relative);
  const resolved = fs.realpathSync(path.resolve(root, relative));
  if (!resolved.startsWith(root + path.sep)) throw new Error('Media path leaves the template folder: ' + relative);
  return resolved;
}
export function probe(file) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('ffprobe could not read ' + path.basename(file) + '.');
  const data = JSON.parse(result.stdout), video = data.streams.find(s => s.codec_type === 'video');
  return { seconds: Number(video?.duration || data.format.duration), hasVideo: Boolean(video), hasAudio: data.streams.some(s => s.codec_type === 'audio') };
}

// Extract (once) a small frame of a clip for blurred backdrops; cached under assets/stills/ (gitignored).
function still(relative, seconds, write) {
  const name = createHash('sha1').update(relative + ':' + fs.statSync(asset(relative)).mtimeMs + ':' + seconds.toFixed(2)).digest('hex').slice(0, 16);
  const target = 'assets/stills/' + name + '.jpg';
  if (write && !fs.existsSync(path.join(root, target))) {
    fs.mkdirSync(path.join(root, 'assets/stills'), { recursive: true });
    const result = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', seconds.toFixed(3), '-i', asset(relative), '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4', path.join(root, target)]);
    if (result.error || result.status !== 0) throw new Error('ffmpeg could not extract a frame from ' + relative);
  }
  return target;
}

export function readConfig(file = path.join(root, 'template.json')) { return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8'))); }
export function normalizeConfig(input) {
  if (!input || typeof input !== 'object') throw new Error('template.json must be an object.');
  const c = { ...defaults, ...input, colors: { ...defaults.colors, ...input.colors } };
  if (typeof c.aroll !== 'string' || !videoTypes.includes(path.extname(c.aroll).toLowerCase())) throw new Error('aroll must be the talking-head video (.mp4, .mov, .m4v or .webm).');
  if (c.captions && path.extname(c.captions).toLowerCase() !== '.srt') throw new Error('captions must be an .srt file or empty.');
  if (!Number.isInteger(c.captionWords) || c.captionWords < 1 || c.captionWords > 8) throw new Error('captionWords must be 1–8.');
  if (!Array.isArray(c.highlight) || c.highlight.some(w => typeof w !== 'string')) throw new Error('highlight must be a list of words.');
  for (const [key, min, max] of [['musicVolume', 0, 2], ['punchIn', 1, 1.6], ['faceFocus', 0, 100], ['splitAt', 400, 1400]]) {
    if (!Number.isFinite(c[key]) || c[key] < min || c[key] > max) throw new Error(key + ' must be between ' + min + ' and ' + max + '.');
  }
  for (const [name, value] of Object.entries(c.colors)) if (!hex(value)) throw new Error('colors.' + name + ' must be #RRGGBB.');
  if (c.profile !== null && (typeof c.profile !== 'object' || typeof c.profile.name !== 'string')) throw new Error('profile must be null or { avatar, name, handle, bio }.');
  if (!Array.isArray(c.scenes)) throw new Error('scenes must be a list.');
  c.scenes = c.scenes.map((input, i) => normalizeScene(input, i, c)).sort((a, b) => a.start - b.start);
  for (let i = 1; i < c.scenes.length; i++) if (c.scenes[i].start < c.scenes[i - 1].end - 0.001) throw new Error(`Scenes overlap at ${c.scenes[i].start}s.`);
  return c;
}
function normalizeScene(input, i, config) {
  const s = { mediaStart: 0, fit: 'cover', background: 'blur', transition: 'cut', ...input }, where = `scenes[${i}] (${s.type})`;
  if (!sceneTypes.includes(s.type)) throw new Error(`scenes[${i}].type must be one of ${sceneTypes.join(', ')}.`);
  if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start) throw new Error(where + ' needs start < end in seconds.');
  if (needsMedia.includes(s.type) || (s.type === 'title' && s.over === 'blur')) {
    if (typeof s.media !== 'string' || ![...imageTypes, ...videoTypes].includes(path.extname(s.media).toLowerCase())) throw new Error(where + ' needs media: an image or video path.');
  }
  if (!Number.isFinite(s.mediaStart) || s.mediaStart < 0) throw new Error(where + ' mediaStart must be ≥ 0.');
  if (!['cover', 'contain'].includes(s.fit)) throw new Error(where + ' fit must be cover or contain.');
  if (s.background !== 'blur' && !hex(s.background)) throw new Error(where + ' background must be blur or #RRGGBB.');
  if (!['cut', 'flash'].includes(s.transition)) throw new Error(where + ' transition must be cut or flash.');
  if (s.captionStyle !== undefined && !['kinetic', 'italic', 'none'].includes(s.captionStyle)) throw new Error(where + ' captionStyle must be kinetic, italic or none.');
  if (s.captionY !== undefined && (!Number.isFinite(s.captionY) || s.captionY < 0 || s.captionY > 1800)) throw new Error(where + ' captionY must be 0–1800.');
  if (s.type === 'title') {
    s.over = s.over || 'face';
    if (!['face', 'blur'].includes(s.over)) throw new Error(where + ' over must be face or blur.');
    if (!Array.isArray(s.lines) || !s.lines.length || s.lines.length > 5) throw new Error(where + ' needs 1–5 lines.');
    s.lines = s.lines.map(line => typeof line === 'string' ? { text: line } : line).map(line => {
      const l = { size: 'm', color: 'white', ...line };
      if (typeof l.text !== 'string' || !l.text || l.text.length > 40) throw new Error(where + ' line text must be 1–40 characters.');
      if (!['s', 'm', 'l'].includes(l.size)) throw new Error(where + ' line size must be s, m or l.');
      if (!hex(l.color) && !(l.color in config.colors)) throw new Error(where + ' line color must be #RRGGBB or one of ' + Object.keys(config.colors).join(', ') + '.');
      if (l.at !== undefined && (!Number.isFinite(l.at) || l.at < 0)) throw new Error(where + ' line at must be seconds from the scene start.');
      return l;
    });
    if (s.tint !== undefined && !hex(s.tint)) throw new Error(where + ' tint must be #RRGGBB.');
  }
  if (s.type === 'cta' && (typeof s.keyword !== 'string' || !s.keyword || s.keyword.length > 30)) throw new Error(where + ' needs a keyword (1–30 characters).');
  return s;
}

// SRT cues become timed words; multi-word cues are spread across the cue by word length.
// `*word*` marks a highlight and `|` forces a new caption, so hand-edited SRTs can steer the look.
export function parseWords(text) {
  const words = [];
  const stamp = value => { const [h, m, s] = value.trim().replace(',', '.').split(':').map(Number); return h * 3600 + m * 60 + s; };
  for (const block of text.replace(/^﻿/, '').replaceAll('\r', '').trim().split(/\n\s*\n/)) {
    const lines = block.split('\n'), timing = lines.findIndex(l => l.includes('-->'));
    if (timing < 0) continue;
    const [a, b] = lines[timing].split(/\s*-->\s*/).map(stamp);
    const tokens = lines.slice(timing + 1).join(' ').replace(/\|/g, ' | ').split(/\s+/).filter(Boolean);
    const real = tokens.filter(t => t !== '|'), total = real.reduce((n, t) => n + t.length + 1, 0);
    let cursor = a, breakNext = false;
    for (const token of tokens) {
      if (token === '|') { breakNext = true; continue; }
      const share = real.length > 1 ? (b - a) * (token.length + 1) / total : b - a;
      const highlight = /^\*.+\*[^\p{L}\p{N}]*$/u.test(token);
      words.push({ text: highlight ? token.replace(/\*/g, '') : token, start: cursor, end: cursor + share, highlight, breakBefore: breakNext });
      cursor += share; breakNext = false;
    }
  }
  return words.filter(w => w.text && w.end > w.start - 0.001);
}

export function segmentsFor(scenes, duration) {
  const segments = []; let cursor = 0;
  for (const scene of scenes) {
    if (scene.start >= duration) break;
    if (scene.start - cursor > 0.05) segments.push({ type: 'face', start: cursor, end: scene.start, implicit: true });
    else if (segments.length) segments.at(-1).end = scene.start;
    segments.push({ ...scene, start: segments.length ? scene.start : 0, end: Math.min(scene.end, duration) });
    cursor = segments.at(-1).end;
  }
  if (duration - cursor > 0.05) segments.push({ type: 'face', start: cursor, end: duration, implicit: true });
  else if (segments.length) segments.at(-1).end = duration;
  let faces = 0;
  for (const seg of segments) {
    const [style, y] = captionDefaults[seg.type];
    seg.captionStyle = seg.captionStyle || style; seg.captionY = seg.captionY ?? y;
    if (seg.type === 'face') seg.punch = faces++ % 2 === 1; // Every other face cut punches in, like a jump cut.
  }
  return segments;
}

export function groupCaptions(words, segments, { maxWords = 4, highlight = [] } = {}) {
  const marked = new Set(highlight.map(bare)), beats = [];
  const segmentAt = t => segments.findIndex(s => t >= s.start - 0.001 && t < s.end);
  for (const word of words) {
    const seg = segmentAt(word.start);
    if (seg < 0 || segments[seg].captionStyle === 'none') continue;
    const last = beats.at(-1), prev = last?.words.at(-1);
    const fresh = !last || last.segment !== seg || last.words.length >= maxWords || word.breakBefore
      || word.start - prev.end > 0.45 || /[.!?,;:]["')\]]*$/.test(prev.text);
    if (fresh) beats.push({ segment: seg, words: [] });
    beats.at(-1).words.push({ ...word, highlight: word.highlight || marked.has(bare(word.text)) });
  }
  beats.forEach((beat, i) => {
    const seg = segments[beat.segment], next = beats[i + 1];
    beat.start = beat.words[0].start;
    beat.end = Math.min(Math.max(beat.words.at(-1).end, beat.start + 0.35) + 0.3, next ? next.words[0].start : Infinity, seg.end);
    beat.style = seg.captionStyle; beat.y = seg.captionY;
  });
  return beats.filter(b => b.end - b.start > 0.05);
}

export function build(input = readConfig(), { write = true } = {}) {
  const config = normalizeConfig(input);
  const arollFile = asset(config.aroll), aroll = probe(arollFile), duration = aroll.seconds;
  if (!aroll.hasVideo) throw new Error('aroll has no video stream.');
  const media = new Map();
  const info = relative => {
    if (!media.has(relative)) {
      const file = asset(relative), image = imageTypes.includes(path.extname(relative).toLowerCase());
      media.set(relative, image ? { image: true } : { image: false, ...probe(file) });
    }
    return media.get(relative);
  };
  const segments = segmentsFor(config.scenes, duration);
  const plan = { duration, words: [], pops: [], slides: [], zooms: [], flashes: [] };
  const clip = (s, d) => ` data-start="${fixed(s)}" data-duration="${fixed(d)}"`;
  const color = name => config.colors[name] || name;
  const html = [], overlays = [];

  // Every element is a top-level timed clip: HyperFrames resolves a video's frames from its own
  // data-start, so media must never sit inside another timed wrapper. Rounded frames are styled on
  // the media element itself, and CSS z-index layers the pieces of a scene.
  segments.forEach((seg, i) => {
    const s = seg.start, d = seg.end - seg.start, timing = clip(s, d);
    const face = (cls, punch = false) => html.push(`<video id="face-${i}" class="clip ${cls} face" src="${esc(config.aroll)}"${timing} data-media-start="${fixed(s)}" data-track-index="1" muted playsinline preload="auto" style="--focus:${config.faceFocus}%${punch ? `;transform:scale(${config.punchIn})` : ''}"></video>`);
    const box = (id, cls, style = '', inner = '') => html.push(`<div id="${id}" class="clip ${cls}"${timing} data-track-index="3"${style ? ` style="${style}"` : ''}>${inner}</div>`);
    const visual = (key, cls) => {
      const m = info(seg.media), fit = seg.fit === 'contain' && key === 'media' ? ' fit-contain' : '';
      // A blurred backdrop is a still frame: a second copy of the same clip with the same timing
      // can be merged with the sharp one when HyperFrames discovers media.
      if (key === 'blur') return html.push(`<img id="blur-${i}" class="clip blurbg" src="${esc(m.image ? seg.media : still(seg.media, seg.mediaStart + Math.min(d, m.seconds - seg.mediaStart) / 2, write))}"${timing} data-track-index="0" alt="">`);
      if (m.image) {
        if (cls === 'fill') plan.zooms.push({ id: `${key}-${i}`, t: s, d }); // Slow push-in on full-frame stills only; framed stills would grow out of their frame.
        return html.push(`<img id="${key}-${i}" class="clip ${cls}${fit}" src="${esc(seg.media)}"${timing} data-track-index="2" alt="">`);
      }
      if (seg.mediaStart >= m.seconds) throw new Error(`Scene at ${s}s starts its media after the media ends (${m.seconds.toFixed(2)}s).`);
      html.push(`<video id="${key}-${i}" class="clip ${cls}${fit}" src="${esc(seg.media)}"${timing} data-media-start="${fixed(seg.mediaStart)}" data-track-index="2" muted playsinline preload="auto"></video>`);
    };
    const backdrop = () => seg.background === 'blur' ? visual('blur', 'blurbg') : box(`bg-${i}`, 'shade dots', `background:${seg.background}`);
    if (seg.type === 'face') face('fill', seg.punch);
    if (seg.type === 'split') { visual('media', 'split-top'); box(`divider-${i}`, 'divider'); face('split-bottom'); }
    if (seg.type === 'broll') visual('media', 'fill');
    if (seg.type === 'phone') { backdrop(); box(`phone-${i}`, 'phone'); visual('media', 'phone-screen'); box(`notch-${i}`, 'phone-notch'); }
    if (seg.type === 'card') { backdrop(); visual('media', 'card'); }
    if (seg.type === 'inset') { visual('media', 'fill'); face('inset'); }
    if (seg.type === 'bubble') { visual('media', 'fill'); face('bubble'); }
    if (seg.type === 'title') {
      if (seg.over === 'blur') { visual('blur', 'blurbg'); box(`shade-${i}`, 'shade', `background:linear-gradient(180deg, ${seg.tint || '#7A2CBF'}99, ${seg.tint || '#7A2CBF'}55 55%, #00000066)`); }
      else { face('fill'); box(`shade-${i}`, 'shade', 'background:linear-gradient(180deg, transparent 45%, #00000073 100%)'); }
      const lines = seg.lines.map((line, j) => {
        plan.pops.push({ id: `title-${i}-${j}`, t: s + (line.at ?? 0.05 + j * 0.12) });
        return `<span id="title-${i}-${j}" class="title-line ${line.size}" style="color:${color(line.color)}">${esc(line.text)}</span>`;
      }).join('');
      box(`title-${i}`, 'title-block', `top:${seg.y ?? (seg.over === 'blur' ? 640 : 1150)}px`, lines);
    }
    if (seg.type === 'cta') {
      face('fill');
      box(`shade-${i}`, 'shade', 'background:linear-gradient(180deg, transparent 45%, #00000066 100%)');
      box(`cta-${i}`, 'cta-block', '', `<span id="cta-comment-${i}" class="cta-comment">${esc(seg.prompt || 'COMMENT')}</span><span id="cta-keyword-${i}" class="cta-keyword">“ ${esc(seg.keyword)} ”</span>`);
      plan.pops.push({ id: `cta-comment-${i}`, t: s + 0.05 }, { id: `cta-keyword-${i}`, t: s + 0.2 });
      const p = config.profile;
      if (p && seg.profile !== false) {
        if (p.avatar) asset(p.avatar);
        box(`profile-${i}`, 'profile', '', `${p.avatar ? `<span class="profile-avatar" style="background-image:url('${esc(p.avatar)}')"></span>` : ''}<span class="profile-text"><span class="profile-name">${esc(p.name)}</span>${p.handle ? `<span class="profile-handle">${esc(p.handle)}</span>` : ''}${p.bio ? `<span class="profile-bio">${esc(p.bio)}</span>` : ''}<span class="profile-follow">${esc(p.button || 'Follow')}</span></span>`);
        plan.slides.push({ id: `profile-${i}`, t: s + 0.35 });
      }
    }
    if (seg.transition === 'flash') { overlays.push(`<div id="flash-${i}" class="flash clip"${clip(s, Math.min(0.3, d))} data-track-index="9"></div>`); plan.flashes.push({ id: `flash-${i}`, t: s }); }
  });

  let captions = '';
  if (config.captions) {
    const words = parseWords(fs.readFileSync(asset(config.captions), 'utf8'));
    const beats = groupCaptions(words, segments, { maxWords: config.captionWords, highlight: config.highlight });
    let n = 0;
    captions = beats.map((beat, b) => {
      const span = w => { const id = `w-${n++}`; plan.words.push({ id, t: Math.max(beat.start, w.start) }); return `<span id="${id}" class="w${w.highlight ? ' hl' : ''}">${esc(w.text)}</span>`; };
      let body;
      if (beat.style === 'kinetic' && beat.words.length > 1) {
        const cut = Math.ceil(beat.words.length / 2);
        body = `<span class="line l1">${beat.words.slice(0, cut).map(span).join(' ')}</span><span class="line l2">${beat.words.slice(cut).map(span).join(' ')}</span>`;
      } else body = `<span class="line ${beat.style === 'kinetic' ? 'l1' : ''}">${beat.words.map(span).join(' ')}</span>`;
      return `<div id="cap-${b}" class="cap cap-${beat.style} clip"${clip(beat.start, beat.end - beat.start)} data-track-index="8" style="top:${beat.y}px">${body}</div>`;
    }).join('\n');
  }
  let audio = aroll.hasAudio ? `<audio id="aroll-audio" class="clip" src="${esc(config.aroll)}"${clip(0, duration)} data-track-index="10" data-volume="1" preload="auto"></audio>` : '';
  if (config.music) { asset(config.music); audio += `<audio id="music" class="clip" src="${esc(config.music)}"${clip(0, duration)} data-track-index="11" data-volume="${config.musicVolume}" data-fade-out="1" preload="auto"></audio>`; }

  const tokens = {
    DURATION: fixed(duration), ACCENT: config.colors.accent, DIVIDER: config.colors.divider,
    SPLIT_AT: config.splitAt, SPLIT_BOTTOM: config.splitAt + 6, SPLIT_HEIGHT: 1920 - config.splitAt - 6,
    SEGMENTS: html.join('\n'), CAPTIONS: captions, OVERLAYS: overlays.join('\n'), AUDIO: audio, PLAN: JSON.stringify(plan)
  };
  const page = fs.readFileSync(path.join(root, 'scripts/quickcut.html'), 'utf8').replace(/\{\{([A-Z_]+)\}\}/g, (_, name) => {
    if (!(name in tokens)) throw new Error('Unknown template field ' + name); return String(tokens[name]);
  });
  const metadata = { duration, width: 1080, height: 1920, segments: segments.map(({ type, start, end }) => ({ type, start, end })), captions: plan.words.length, audio: aroll.hasAudio };
  if (!write) return { config, metadata, html: page };
  fs.mkdirSync(path.join(root, 'assets/vendor'), { recursive: true });
  fs.copyFileSync(require.resolve('gsap/dist/gsap.min.js'), path.join(root, 'assets/vendor/gsap.min.js'));
  fs.writeFileSync(path.join(root, 'index.html.tmp'), page);
  fs.renameSync(path.join(root, 'index.html.tmp'), path.join(root, 'index.html'));
  console.log(`Built quickcut-tutorial: ${duration.toFixed(2)}s, ${segments.length} segments (${segments.map(s => s.type).join(' → ')}), ${plan.words.length} caption words.`);
  return { config, metadata, html: page };
}

// Word-level subtitles for a talking-head video, written next to it as <name>.words.srt.
export function transcribe(relative, language = 'auto') {
  const input = asset(relative), model = resolveWhisperModel();
  if (!fs.existsSync(model)) throw new Error('Whisper model not found. Run: pnpm setup:editorial-explainer --with-whisper');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'quickcut-')), wav = path.join(work, 'speech.wav');
  const out = input.replace(/\.[^.]+$/, '.words');
  for (const [bin, args] of [['ffmpeg', ['-v', 'error', '-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]],
    ['whisper-cli', ['-m', model, '-f', wav, '-l', language, '-osrt', '-of', out, '-ml', '1', '-sow', '-t', '8']]]) {
    const result = spawnSync(bin, args, { stdio: ['ignore', 'ignore', 'inherit'] });
    if (result.error || result.status !== 0) throw new Error(bin + ' failed.');
  }
  fs.rmSync(work, { recursive: true, force: true });
  console.log('Wrote ' + path.relative(root, out + '.srt'));
  return path.relative(root, out + '.srt');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { config: { type: 'string' }, language: { type: 'string', default: 'auto' } } });
    const command = positionals[0] || 'build';
    if (command === 'build') build(readConfig(values.config ? path.resolve(values.config) : undefined));
    else if (command === 'transcribe' && positionals[1]) transcribe(positionals[1], values.language);
    else throw new Error('Usage: node scripts/build.mjs [build] [--config file.json] | transcribe <video> [--language en]');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
