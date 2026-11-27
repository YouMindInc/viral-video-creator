#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(path.join(root, 'package.json'));
export const hf = path.join(path.dirname(require.resolve('hyperframes/package.json')), 'bin/hyperframes.mjs');
const defaults = {
  layout: 'auto', motion: 'static', audio: 'result', duration: 0, cta: '',
  model: { name: 'YouMind', icon: 'assets/brand/youmind-mark.png', colors: ['#4F8DF7', '#B36CF2'] },
  prompt: { title: 'Prompt', text: '' },
  reference: { title: 'Reference', media: '', fit: 'cover', background: '#FFFFFF', radius: 5 },
  endCard: { enabled: true, icon: 'assets/brand/youmind-app-icon.png', name: 'YouMind', text: '', minDuration: 2.8 },
  voice: { text: '', speaker: 'Samantha', rate: 175, file: '', volume: 1 },
  colors: { top: '#F7C29A', mid: '#FADBC6', bottom: '#FFF9F4', card: '#5F5F5F', cardInk: '#FFFFFF', ink: '#0D0D0D' }
};
const imageTypes = ['.jpg', '.jpeg', '.png', '.webp'], videoTypes = ['.mp4', '.mov', '.m4v', '.webm'], audioTypes = ['.mp3', '.m4a', '.wav', '.aac', '.aiff'];
export const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const fixed = value => Number(value).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');

export function asset(relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('Media paths must be relative to templates/prompt-recipe-advanced: ' + relative);
  const resolved = fs.realpathSync(path.resolve(root, relative));
  if (!resolved.startsWith(root + path.sep)) throw new Error('Media path leaves the template folder: ' + relative);
  return resolved;
}
export function probe(file) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('ffprobe could not read ' + path.basename(file) + '.');
  const data = JSON.parse(result.stdout), video = data.streams.find(s => s.codec_type === 'video');
  const seconds = Number(video?.duration || data.format.duration);
  const rotation = video?.side_data_list?.find(s => s.rotation !== undefined)?.rotation || 0;
  const rotated = Math.abs(rotation % 180) === 90;
  return { hasVideo: Boolean(video), width: rotated ? video?.height : video?.width, height: rotated ? video?.width : video?.height, seconds, hasAudio: data.streams.some(s => s.codec_type === 'audio') };
}

export function readConfig(file = path.join(root, 'template.json')) { return normalizeConfig(JSON.parse(fs.readFileSync(file, 'utf8'))); }
export function normalizeConfig(input) {
  if (!input || typeof input !== 'object') throw new Error('template.json must be an object.');
  const c = { ...defaults, ...input, model: { ...defaults.model, ...input.model }, prompt: { ...defaults.prompt, ...input.prompt },
    reference: { ...defaults.reference, ...input.reference }, endCard: { ...defaults.endCard, ...input.endCard },
    voice: { ...defaults.voice, ...input.voice }, colors: { ...defaults.colors, ...input.colors } };
  if (!['auto', 'tall', 'wide'].includes(c.layout)) throw new Error('layout must be auto, tall or wide.');
  if (!['static', 'pop'].includes(c.motion)) throw new Error('motion must be static or pop.');
  if (!['cover', 'contain'].includes(c.reference.fit)) throw new Error('reference.fit must be cover or contain.');
  if (!Number.isFinite(c.reference.radius) || c.reference.radius < 0 || c.reference.radius > 120) throw new Error('reference.radius must be 0–120 px.');
  if (typeof c.result !== 'string' || !videoTypes.includes(path.extname(c.result).toLowerCase())) throw new Error('result must be a video (.mp4, .mov, .m4v or .webm).');
  if (c.reference.media && ![...imageTypes, ...videoTypes].includes(path.extname(c.reference.media).toLowerCase())) throw new Error('reference.media must be an image or a video.');
  if (typeof c.prompt.text !== 'string' || !c.prompt.text.trim() || c.prompt.text.length > 3000) throw new Error('prompt.text is required (up to 3000 characters).');
  for (const value of [c.model.name, c.prompt.title, c.reference.title, c.endCard.name]) if (typeof value !== 'string' || value.length > 40) throw new Error('Titles and names must be text up to 40 characters.');
  const image = value => typeof value === 'string' && [...imageTypes, '.svg'].includes(path.extname(value).toLowerCase());
  if (c.model.icon !== 'sparkle' && !image(c.model.icon)) throw new Error('model.icon must be sparkle or an image (.png, .svg, .jpg, .webp).');
  if (!image(c.endCard.icon)) throw new Error('endCard.icon must be an image (.png, .svg, .jpg, .webp).');
  if (!Array.isArray(c.model.colors) || c.model.colors.length !== 2) throw new Error('model.colors must be two colours.');
  for (const color of [...c.model.colors, ...Object.values(c.colors), c.reference.background]) if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Colours must be #RRGGBB: ' + color);
  for (const [key, value] of [['cta', c.cta], ['endCard.text', c.endCard.text], ['voice.text', c.voice.text]]) {
    if (typeof value !== 'string' || value.length > 160) throw new Error(key + ' must be text up to 160 characters.');
  }
  if (typeof c.endCard.enabled !== 'boolean') throw new Error('endCard.enabled must be true or false.');
  if (!Number.isFinite(c.endCard.minDuration) || c.endCard.minDuration < 1 || c.endCard.minDuration > 10) throw new Error('endCard.minDuration must be 1–10 seconds.');
  if (c.voice.file && !audioTypes.concat(videoTypes).includes(path.extname(c.voice.file).toLowerCase())) throw new Error('voice.file must be an audio file.');
  if (typeof c.voice.speaker !== 'string' || !/^[\w ().-]{1,40}$/.test(c.voice.speaker)) throw new Error('voice.speaker must be a macOS voice name, e.g. Samantha or Daniel.');
  if (!Number.isInteger(c.voice.rate) || c.voice.rate < 90 || c.voice.rate > 320) throw new Error('voice.rate must be 90–320 words per minute.');
  if (!Number.isFinite(c.voice.volume) || c.voice.volume < 0 || c.voice.volume > 3) throw new Error('voice.volume must be 0–3.');
  if (!Number.isFinite(c.duration) || c.duration < 0) throw new Error('duration must be 0 (use the result length) or a positive number of seconds.');
  if (c.audio !== 'result' && c.audio !== 'none' && ![...videoTypes, ...audioTypes].includes(path.extname(c.audio).toLowerCase())) throw new Error('audio must be result, none, or an audio/video file.');
  return c;
}

// "Comment {skill} to get…" → the braced keyword becomes an ink chip.
function callToAction(text) {
  if (!text.trim()) return '';
  return '<span class="cta-line">' + esc(text.trim()).replace(/\{([^{}]+)\}/g, '<span class="kw">$1</span>') + '</span>';
}
function paragraphs(text) {
  return text.trim().split(/\n\s*\n/).map(p => '<p>' + esc(p.trim()).replaceAll('\n', '<br>') + '</p>').join('');
}

// The closing voice line: the user's own recording, or macOS text-to-speech cached under assets/voice/ (gitignored).
export function voiceLine(voice) {
  if (voice.file) return { file: voice.file, seconds: probe(asset(voice.file)).seconds, text: voice.text };
  if (!voice.text.trim()) return null;
  const id = createHash('sha1').update(JSON.stringify([voice.speaker, voice.rate, voice.text.trim()])).digest('hex').slice(0, 16);
  const relative = 'assets/voice/' + id + '.m4a', target = path.join(root, relative);
  if (!fs.existsSync(target)) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-voice-')), aiff = path.join(work, 'line.aiff');
    const say = spawnSync('say', ['-v', voice.speaker, '-r', String(voice.rate), '-o', aiff, voice.text.trim()], { encoding: 'utf8' });
    if (say.error || say.status !== 0) throw new Error('macOS text-to-speech failed (voice "' + voice.speaker + '"). Set voice.file to a recording instead. ' + (say.stderr || say.error?.message || ''));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const encode = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', aiff, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '160k', target]);
    fs.rmSync(work, { recursive: true, force: true });
    if (encode.error || encode.status !== 0) throw new Error('ffmpeg could not encode the voice line.');
  }
  return { file: relative, seconds: probe(target).seconds, text: voice.text.trim() };
}

// The clip's last frame sits behind the video so the crossfade into the end card never shows an empty box.
// Cached under assets/stills/ (gitignored).
function lastFrame(relative, seconds) {
  const id = createHash('sha1').update(relative + ':' + fs.statSync(asset(relative)).mtimeMs + ':' + seconds.toFixed(3)).digest('hex').slice(0, 16);
  const target = 'assets/stills/' + id + '.jpg';
  if (!fs.existsSync(path.join(root, target))) {
    fs.mkdirSync(path.join(root, 'assets/stills'), { recursive: true });
    const result = spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', Math.max(0, seconds - 0.12).toFixed(3), '-i', asset(relative), '-frames:v', '1', '-q:v', '3', path.join(root, target)]);
    if (result.error || result.status !== 0) throw new Error('ffmpeg could not extract the last frame of ' + relative);
  }
  return target;
}

export function build(input = readConfig(), { write = true } = {}) {
  const config = normalizeConfig(input);
  const resultFile = asset(config.result), result = probe(resultFile);
  if (!result.hasVideo) throw new Error('result has no video stream.');
  const layout = config.layout === 'auto' ? (result.height > result.width ? 'tall' : 'wide') : config.layout;
  const resultEnd = config.duration || result.seconds;
  if (resultEnd > result.seconds + 0.05) throw new Error('duration is longer than the result video (' + result.seconds.toFixed(2) + 's).');
  const voice = voiceLine(config.voice);

  // With an end card, the card follows the clip and lasts as long as the voice line needs.
  // Without one, the voice ends with the clip.
  let duration = resultEnd, end = null, voiceStart = null;
  if (config.endCard.enabled) {
    const length = Math.max(config.endCard.minDuration, voice ? voice.seconds + 0.45 + 0.7 : 0);
    end = { start: resultEnd, length };
    duration = resultEnd + length;
    voiceStart = resultEnd + 0.45;
  } else if (voice) voiceStart = Math.max(0, resultEnd - voice.seconds - 0.3);
  const endText = config.endCard.text || config.cta;
  const keyword = /\{([^{}]+)\}/.exec(endText)?.[1];
  if (end) {
    // Pulse the chip roughly when the voice reaches the keyword: its share of the spoken text.
    const spoken = voice?.text.toLowerCase() || '', at = keyword ? spoken.indexOf(keyword.toLowerCase()) : -1;
    end.keywordAt = voice && at >= 0 ? voiceStart + voice.seconds * at / spoken.length : end.start + 0.9;
  }

  const clip = (start, length) => ' data-start="' + fixed(start) + '" data-duration="' + fixed(length) + '"';
  let referenceMedia = '';
  if (config.reference.media) {
    asset(config.reference.media);
    referenceMedia = imageTypes.includes(path.extname(config.reference.media).toLowerCase())
      ? '<img src="' + esc(config.reference.media) + '" alt="Reference">'
      : '<video id="reference-video" class="clip" src="' + esc(config.reference.media) + '"' + clip(0, resultEnd) + ' data-track-index="2" muted playsinline preload="auto"></video>';
  }
  let soundtrack = '';
  if (config.audio === 'result' && result.hasAudio) soundtrack = config.result;
  else if (config.audio !== 'result' && config.audio !== 'none') { asset(config.audio); soundtrack = config.audio; }
  let audio = soundtrack ? '<audio id="soundtrack" class="clip" src="' + esc(soundtrack) + '"' + clip(0, resultEnd) + ' data-track-index="3" data-volume="1" preload="auto"></audio>' : '';
  if (voice) audio += '<audio id="voice" class="clip" src="' + esc(voice.file) + '"' + clip(voiceStart, Math.min(voice.seconds, duration - voiceStart)) + ' data-track-index="5" data-volume="' + config.voice.volume + '" preload="auto"></audio>';

  let endCard = '';
  if (end) {
    asset(config.endCard.icon);
    // Spans rather than divs: the card is a timed element, so its children stay plain content.
    endCard = '<div id="end-card" class="clip"' + clip(end.start, end.length) + ' data-track-index="4"><span class="grid"></span>'
      + '<span id="end-icon" class="box" style="background:url(\'' + esc(config.endCard.icon) + '\') center / contain no-repeat"></span>'
      + '<span id="end-name" class="box">' + esc(config.endCard.name) + '</span>'
      + '<span id="end-cta" class="box">' + callToAction(endText) + '</span></div>';
  }

  // The badge icon is the YouMind mark by default; "sparkle" draws the generic four-point star in model.colors.
  const icon = config.model.icon === 'sparkle'
    ? `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="spark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${config.model.colors[0]}"/><stop offset="1" stop-color="${config.model.colors[1]}"/></linearGradient></defs><path fill="url(#spark)" d="M32 2c2.6 15.4 14.6 27.4 30 30-15.4 2.6-27.4 14.6-30 30C29.4 46.6 17.4 34.6 2 32 17.4 29.4 29.4 17.4 32 2Z"/></svg>`
    : (asset(config.model.icon), `<img src="${esc(config.model.icon)}" alt="">`);
  const plan = { duration, motion: config.motion === 'pop', end };
  const tokens = {
    LAYOUT: layout, DURATION: fixed(duration), PLAN: JSON.stringify(plan),
    MODEL_NAME: esc(config.model.name), MODEL_ICON: icon, CTA: callToAction(config.cta), END_CARD: endCard,
    PROMPT_TITLE: esc(config.prompt.title), PROMPT_TEXT: paragraphs(config.prompt.text),
    REFERENCE_TITLE: esc(config.reference.title), REFERENCE_MEDIA: referenceMedia, REFERENCE_FIT: config.reference.fit,
    REFERENCE_BG: config.reference.background, REFERENCE_RADIUS: config.reference.radius,
    RESULT_HOLD: end ? lastFrame(config.result, resultEnd) : '',
    RESULT_VIDEO: '<video id="result-video" class="clip" src="' + esc(config.result) + '"' + clip(0, resultEnd) + ' data-track-index="1" muted playsinline preload="auto"></video>',
    AUDIO: audio,
    BG_TOP: config.colors.top, BG_MID: config.colors.mid, BG_BOTTOM: config.colors.bottom, CARD: config.colors.card, CARD_INK: config.colors.cardInk, INK: config.colors.ink
  };
  const html = fs.readFileSync(path.join(root, 'scripts/prompt-recipe-advanced.html'), 'utf8').replace(/\{\{([A-Z_]+)\}\}/g, (_, name) => {
    if (!(name in tokens)) throw new Error('Unknown template field ' + name); return String(tokens[name]);
  });
  const metadata = { layout, duration, resultEnd, width: 1080, height: 1920, audio: Boolean(soundtrack), voice: voice ? { file: voice.file, start: voiceStart, seconds: voice.seconds } : null, end };
  if (!write) return { config, metadata, html };
  fs.mkdirSync(path.join(root, 'assets/vendor'), { recursive: true });
  fs.copyFileSync(require.resolve('gsap/dist/gsap.min.js'), path.join(root, 'assets/vendor/gsap.min.js'));
  fs.writeFileSync(path.join(root, 'index.html.tmp'), html);
  fs.renameSync(path.join(root, 'index.html.tmp'), path.join(root, 'index.html'));
  console.log('Built prompt-recipe-advanced: ' + layout + ' layout, ' + resultEnd.toFixed(2) + 's clip'
    + (end ? ' + ' + end.length.toFixed(2) + 's end card' : '') + (voice ? ', voice at ' + voiceStart.toFixed(2) + 's (' + voice.seconds.toFixed(2) + 's)' : '') + '.');
  return { config, metadata, html };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { config: { type: 'string' } } });
    const config = readConfig(values.config ? path.resolve(values.config) : undefined);
    const command = positionals[0] || 'build';
    if (command !== 'build') throw new Error('Usage: node scripts/build.mjs [build] [--config file.json]');
    build(config);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
