// Voice-over engine shared by the voice-driven templates (swap-list, feature-drop; keep the two copies identical).
// Every spoken line becomes a cached macOS text-to-speech clip (or the user's own recording). Lines are laid end to end,
// captions reveal word by word in step with them, and voice, sound effects and optional music are mixed into one track.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const imageTypes = ['.jpg', '.jpeg', '.png', '.webp', '.svg'], videoTypes = ['.mp4', '.mov', '.m4v', '.webm'], audioTypes = ['.mp3', '.m4a', '.wav', '.aac', '.aiff'];
export const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export const fixed = value => Number(value).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
const hash = value => createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 16);

export function asset(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) throw new Error('Media paths must be relative to templates/' + path.basename(root) + ': ' + relative);
  const resolved = fs.realpathSync(path.resolve(root, relative));
  if (!resolved.startsWith(root + path.sep)) throw new Error('Media path leaves the template folder: ' + relative);
  return resolved;
}
export function probe(file) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('ffprobe could not read ' + path.basename(file) + '.');
  const data = JSON.parse(result.stdout), video = data.streams.find(s => s.codec_type === 'video');
  return { seconds: Number(video?.duration || data.format.duration), hasVideo: Boolean(video), width: video?.width, height: video?.height };
}

export function normalizeVoice(voice) {
  if (typeof voice.speaker !== 'string' || !/^[\w ().-]{1,40}$/.test(voice.speaker)) throw new Error('voice.speaker must be a macOS voice name, e.g. Samantha, Daniel or Meijia.');
  if (!Number.isInteger(voice.rate) || voice.rate < 90 || voice.rate > 320) throw new Error('voice.rate must be 90–320 words per minute.');
  if (!Number.isFinite(voice.gap) || voice.gap < 0 || voice.gap > 2) throw new Error('voice.gap must be 0–2 seconds.');
  if (!Number.isFinite(voice.volume) || voice.volume < 0 || voice.volume > 3) throw new Error('voice.volume must be 0–3.');
}

// A line is "text with {highlights}" or { text, speak, audio, mood }:
// speak overrides the pronunciation (captions keep text) and audio points at the user's own recording of the line.
export function lines(value, where, moods = []) {
  const list = value === undefined || value === '' ? [] : Array.isArray(value) ? value : [value];
  return list.map((item, i) => {
    const line = typeof item === 'string' ? { text: item } : { ...item };
    const label = where + (list.length > 1 ? '[' + i + ']' : '');
    if (typeof line.text !== 'string' || !line.text.trim() || line.text.length > 220) throw new Error(label + ' needs text up to 220 characters.');
    if (line.speak !== undefined && (typeof line.speak !== 'string' || !line.speak.trim())) throw new Error(label + '.speak must be text.');
    if (line.audio !== undefined && !audioTypes.concat(videoTypes).includes(path.extname(String(line.audio)).toLowerCase())) throw new Error(label + '.audio must be an audio file.');
    if (line.mood !== undefined && !moods.includes(line.mood)) throw new Error(label + '.mood must be one of ' + moods.join(', ') + '.');
    return line;
  });
}
export const spoken = line => (line.speak || line.text).replace(/[{}]/g, '').trim();

// One line of speech: the recording when given, otherwise text-to-speech cached under assets/voice/ (gitignored).
// Silence at both ends is trimmed so captions and cuts can be timed from the clip length.
export function speech(root, line, voice) {
  if (line.audio) return { file: line.audio, seconds: probe(asset(root, line.audio)).seconds };
  const text = spoken(line), relative = 'assets/voice/' + hash([voice.speaker, voice.rate, text]) + '.m4a', target = path.join(root, relative);
  if (!fs.existsSync(target)) {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'voiceover-')), aiff = path.join(work, 'line.aiff');
    const say = spawnSync('say', ['-v', voice.speaker, '-r', String(voice.rate), '-o', aiff, text], { encoding: 'utf8' });
    if (say.error || say.status !== 0) throw new Error('macOS text-to-speech failed (voice "' + voice.speaker + '"). Give the line an audio recording instead. ' + (say.stderr || say.error?.message || ''));
    const trim = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03';
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const encode = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', aiff, '-af', trim + ',areverse,' + trim + ',areverse,loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '160k', target + '.tmp.m4a']);
    fs.rmSync(work, { recursive: true, force: true });
    if (encode.error || encode.status !== 0) throw new Error('ffmpeg could not encode the voice line: ' + text);
    fs.renameSync(target + '.tmp.m4a', target);
  }
  return { file: relative, seconds: probe(target).seconds };
}

// Lays lines end to end. Each spoken line records where it starts and how long it lasts.
export class Narration {
  constructor(root, voice) { this.root = root; this.voice = voice; this.t = 0; this.spoken = []; this.effects = []; }
  wait(seconds) { this.t += seconds; return this.t; }
  say(line, extra = {}) {
    const { file, seconds } = speech(this.root, line, this.voice);
    const entry = { ...line, ...extra, file, start: this.t, seconds, end: this.t + seconds };
    this.spoken.push(entry);
    this.t = entry.end + this.voice.gap;
    return entry;
  }
  sound(name, at, volume = 1) { if (!(name in effects)) throw new Error('Unknown sound ' + name); this.effects.push({ name, at, volume }); }
}

// Synthesised interface sounds (no samples to license), generated once into assets/voice/.
const effects = {
  pop: "aevalsrc='0.5*sin(2*PI*(1250-800*t/0.09)*t)*exp(-t*36)':s=48000:d=0.11",
  whoosh: 'anoisesrc=d=0.34:c=pink:a=0.32:r=48000,highpass=f=700,lowpass=f=5200,afade=t=in:d=0.14,afade=t=out:st=0.14:d=0.2',
  type: "aevalsrc='0.2*sin(2*PI*2500*t)*exp(-mod(t,0.065)*130)':s=48000:d=0.45",
  thud: "aevalsrc='0.95*sin(2*PI*(170-90*t/0.24)*t)*exp(-t*15)':s=48000:d=0.26",
  ding: "aevalsrc='0.32*(sin(2*PI*1320*t)+0.5*sin(2*PI*1980*t))*exp(-t*6)':s=48000:d=0.6",
  tick: "aevalsrc='0.22*sin(2*PI*1900*t)*exp(-t*90)':s=48000:d=0.05"
};
function effect(root, name) {
  const relative = 'assets/voice/sfx-' + name + '-' + hash(effects[name]).slice(0, 8) + '.wav', target = path.join(root, relative);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const result = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', effects[name], '-ac', '1', target]);
    if (result.error || result.status !== 0) throw new Error('ffmpeg could not generate the ' + name + ' sound.');
  }
  return relative;
}

// Voice, sound effects and looping background music in one file, cached by its inputs.
export function mixdown(narration, duration, { sfx = true, music = {} } = {}) {
  const root = narration.root;
  const parts = narration.spoken.map(s => ({ file: s.file, at: s.start, volume: narration.voice.volume }));
  if (sfx) for (const e of narration.effects) parts.push({ file: effect(root, e.name), at: e.at, volume: 0.55 * e.volume });
  if (!parts.length) return null;
  const stamp = file => fs.statSync(asset(root, file)).mtimeMs;
  const relative = 'assets/voice/mix-' + hash([parts.map(p => [p.file, stamp(p.file), p.at.toFixed(3), p.volume]), duration.toFixed(3), music.file ? [music.file, stamp(music.file), music.volume] : null]) + '.m4a';
  const target = path.join(root, relative);
  if (fs.existsSync(target)) return relative;
  const args = ['-v', 'error', '-y'], chains = [], labels = [];
  parts.forEach((p, i) => {
    args.push('-i', asset(root, p.file));
    const ms = Math.max(0, Math.round(p.at * 1000));
    chains.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${p.volume.toFixed(3)},adelay=${ms}|${ms}[a${i}]`);
    labels.push(`[a${i}]`);
  });
  if (music.file) {
    args.push('-stream_loop', '-1', '-i', asset(root, music.file));
    const fade = Math.max(0, duration - 1.2).toFixed(3);
    chains.push(`[${parts.length}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${duration.toFixed(3)},volume=${music.volume},afade=t=out:st=${fade}:d=1.2[m]`);
    labels.push('[m]');
  }
  chains.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,alimiter=limit=0.95,apad,atrim=0:${duration.toFixed(3)}[out]`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const result = spawnSync('ffmpeg', [...args, '-filter_complex', chains.join(';'), '-map', '[out]', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', target + '.tmp.m4a'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('ffmpeg could not mix the soundtrack. ' + (result.stderr || ''));
  fs.renameSync(target + '.tmp.m4a', target);
  return relative;
}

// Caption text → tokens. {Highlights} stay whole; CJK characters reveal one at a time; other text reveals word by word.
const cjk = '\\u2e80-\\u2fff\\u3000-\\u303f\\u3040-\\u30ff\\u3400-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef';
const pieces = new RegExp(`[${cjk}]|[^\\s${cjk}]+|\\s+`, 'g'), isCjk = new RegExp(`[${cjk}]`);
export function tokens(text) {
  const out = [];
  for (const part of text.split(/(\{[^{}]*\})/)) {
    if (!part) continue;
    if (part.startsWith('{') && part.endsWith('}')) { out.push({ text: part.slice(1, -1), hl: true }); continue; }
    for (const [piece] of part.matchAll(pieces)) out.push(/^\s+$/.test(piece) ? { space: true } : { text: piece });
  }
  return out;
}
// When each token appears: its share of the line's characters (CJK characters weigh more), across most of the clip.
export function revealTimes(list, start, seconds) {
  const weight = t => t.space ? 0 : [...t.text].reduce((sum, ch) => sum + (isCjk.test(ch) ? 2.6 : 1), 0) + 0.6;
  const total = list.reduce((sum, t) => sum + weight(t), 0) || 1;
  let before = 0;
  return list.map(t => { const at = start + seconds * 0.9 * before / total; before += weight(t); return at; });
}
// Caption HTML for one spoken line, plus the reveal events for the timeline.
export function caption(id, line, className) {
  const list = tokens(line.text), times = revealTimes(list, line.start, line.seconds), reveals = [];
  let html = '', n = 0, open = false;
  const punctuation = /^\p{P}+$/u;
  list.forEach((t, i) => {
    if (t.space) { html += ' '; return; }
    // Punctuation right after a highlight stays on its line ("{prototype}," never wraps before the comma).
    const glue = t.hl && list[i + 1] && !list[i + 1].space && punctuation.test(list[i + 1].text);
    if (glue) { html += '<span class="nw">'; open = true; }
    const wid = id + '-' + n++;
    html += '<span id="' + wid + '" class="w' + (t.hl ? ' hl' : '') + '">' + esc(t.text) + '</span>';
    if (open && !glue) { html += '</span>'; open = false; }
    reveals.push({ id: wid, t: Number(times[i].toFixed(3)), hl: Boolean(t.hl) });
  });
  if (open) html += '</span>';
  return { html: '<span class="cap-text">' + html + '</span>', reveals, className };
}
// "Every one is {free}" → HTML with the braced words wrapped in a marker span.
export function marked(text, cls = 'mark') {
  return esc(text).replace(/\{([^{}]+)\}/g, '<span class="' + cls + '">$1</span>');
}
