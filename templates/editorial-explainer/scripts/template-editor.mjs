#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { root, hf, readConfig, build, probe, cropFor, digest, defaultLayout } from './hyperframes-project.mjs';
import { sam2Tests } from './sam2-bridge.mjs';

const editorPort = Number(process.env.NEWS_EDITOR_PORT || 3018);
const appId = 'news-channel-template-editor';
const projectName = path.basename(root);
const MAX_UPLOAD = 1024 * 1024 * 1024;
const videoExtensions = new Set(['.mp4', '.mov', '.webm', '.m4v']);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf', '.ttc': 'font/collection', '.woff2': 'font/woff2', '.srt': 'text/plain; charset=utf-8' };
let job = { status: 'idle', log: '', error: '' };
let studio = { status: 'idle', url: 'http://localhost:3017/#project/' + projectName, message: '' };
let saving = false;
let localServer;
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
function cleanLog(text) { return text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '\n'); }
function assertIdle() { if (saving || job.status === 'running') throw new Error('正在處理人物，完成後即可儲存新的素材或位置。'); }
async function readJSON(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 128 * 1024) throw new Error('設定內容過大。'); }
  return JSON.parse(body);
}
function startStudio() {
  if (studio.status === 'starting' || studio.status === 'ready') return;
  studio = { ...studio, status: 'starting', message: '' };
  const child = spawn(hf, ['preview', root, '--port', '3017', '--background', '--no-open', '--json'], { cwd: root });
  let output = '';
  const capture = chunk => { output = (output + cleanLog(String(chunk))).slice(-12000); };
  child.stdout.on('data', capture); child.stderr.on('data', capture);
  child.on('error', error => { studio = { ...studio, status: 'error', message: error.message }; });
  child.on('close', code => {
    const port = output.match(/http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/)?.[1] || output.match(/"port"\s*:\s*(\d+)/)?.[1] || '3017';
    studio = { status: code === 0 ? 'ready' : 'error', url: 'http://localhost:' + port + '/#project/' + projectName, message: code === 0 ? '' : output.slice(-2500) };
  });
}
function startCutout(kind = 'prepare') {
  assertIdle();
  if (kind === 'prepare' && !sam2Tests()) throw new Error('請先產生並檢查 SAM2 抽樣畫面。');
  job = { status: 'running', kind, log: kind === 'test' ? '使用已安裝的 SAM2 模型產生五張抽樣畫面。' : '開始處理完整人物圖層。', error: '' };
  const child = spawn(process.execPath, [path.join(root, 'scripts/sam2-bridge.mjs'), kind], { cwd: root });
  const capture = chunk => { job.log = (job.log + '\n' + cleanLog(String(chunk))).slice(-6000); };
  child.stdout.on('data', capture); child.stderr.on('data', capture);
  child.on('error', error => { job.status = 'error'; job.error = error.message; });
  child.on('close', code => {
    job.status = code === 0 ? 'done' : 'error';
    if (code !== 0) job.error = '去背未完成。原始人物預覽仍可使用，詳細原因見下方紀錄。';
  });
}
async function upload(req, url) {
  assertIdle();
  const kind = url.searchParams.get('kind'), name = path.basename(url.searchParams.get('name') || '');
  const ext = path.extname(name).toLowerCase();
  if (!['persona', 'visual', 'captions'].includes(kind)) throw new Error('無效的素材類型。');
  if (kind === 'captions' ? ext !== '.srt' : !videoExtensions.has(ext)) throw new Error('請選取 MP4、MOV、WebM 影片或 SRT 字幕。');
  const dir = path.join(root, 'assets/inputs'); fs.mkdirSync(dir, { recursive: true });
  const temporary = path.join(dir, '.upload-' + randomUUID() + ext);
  let size = 0;
  const limit = new Transform({ transform(chunk, _encoding, callback) {
    size += chunk.length; callback(size > (kind === 'captions' ? 2 * 1024 * 1024 : MAX_UPLOAD) ? new Error('檔案超過上限（影片 1GB、字幕 2MB）。') : null, chunk);
  } });
  try {
    await pipeline(req, limit, fs.createWriteStream(temporary, { flags: 'wx' }));
    if (!size) throw new Error('選取的檔案是空的。');
    const info = kind === 'captions' ? null : probe(temporary);
    const filename = kind + '-' + digest(temporary).slice(0, 16) + ext;
    const destination = path.join(dir, filename);
    if (fs.existsSync(destination)) fs.unlinkSync(temporary); else fs.renameSync(temporary, destination);
    return { path: 'assets/inputs/' + filename, name, info: info && { width: info.width, height: info.height, seconds: info.seconds, hasAudio: info.hasAudio, maxCropY: cropFor(info, { cropY: 0 }).maxY } };
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
export function resolvePublicPath(requestPath) {
  const relative = decodeURIComponent(requestPath).replace(/^\/+/, '');
  if (!/^(editor|assets|source)\//.test(relative) || relative.split('/').some(p => p.startsWith('.'))) throw new Error('找不到檔案。');
  const file = fs.realpathSync(path.resolve(root, relative));
  if (!file.startsWith(root + path.sep) || !mime[path.extname(file).toLowerCase()]) throw new Error('找不到檔案。');
  return file;
}
function sendFile(req, res, file) {
  const stat = fs.statSync(file);
  if (!stat.isFile()) { res.writeHead(404); res.end(); return; }
  const headers = { 'Content-Type': mime[path.extname(file).toLowerCase()], 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
  const range = req.headers.range;
  let start = 0, end = stat.size - 1, status = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) { res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size }); res.end(); return; }
    if (!match[1]) start = Math.max(0, stat.size - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (start > end || start >= stat.size || !Number.isFinite(start + end)) { res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size }); res.end(); return; }
    status = 206; headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + stat.size;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = fs.createReadStream(file, { start, end });
  stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
}
export async function handler(req, res) {
  try {
    const expectedHost = new Set(['127.0.0.1:' + editorPort, 'localhost:' + editorPort]);
    if (!expectedHost.has(req.headers.host)) { json(res, 403, { error: 'Local editor only.' }); return; }
    const url = new URL(req.url, 'http://' + req.headers.host);
    if (req.method === 'POST') {
      if (req.headers.origin && !['http://localhost:' + editorPort, 'http://127.0.0.1:' + editorPort].includes(req.headers.origin)) { json(res, 403, { error: 'Origin not allowed.' }); return; }
      if (url.pathname !== '/api/upload' && !req.headers['content-type']?.startsWith('application/json')) { json(res, 415, { error: 'JSON required.' }); return; }
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const metadata = JSON.parse(fs.readFileSync(path.join(root, 'analysis/hyperframes-build.json'), 'utf8'));
      json(res, 200, { appId, projectDir: root, config: readConfig(), metadata, defaultLayout, job, studio, sam2Tests: sam2Tests() }); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/save') {
      assertIdle(); saving = true;
      try { const result = build(await readJSON(req), true); json(res, 200, result); }
      finally { saving = false; }
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/upload') { json(res, 201, await upload(req, url)); return; }
    if (req.method === 'POST' && url.pathname === '/api/prepare') { startCutout(); json(res, 202, job); return; }
    if (req.method === 'POST' && url.pathname === '/api/sam2-test') { startCutout('test'); json(res, 202, job); return; }
    if (req.method === 'POST' && url.pathname === '/api/studio') { startStudio(); json(res, 202, studio); return; }
    if (req.method === 'POST' && url.pathname === '/api/shutdown') {
      assertIdle(); json(res, 200, { ok: true });
      setTimeout(() => { localServer?.close(); localServer?.closeAllConnections(); }, 100); return;
    }
    if (req.method === 'GET' && url.pathname === '/layout-preview') {
      const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('</body>', '<script src="editor/layout-preview.js"></script></body>');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); return;
    }
    if (['GET', 'HEAD'].includes(req.method)) {
      const requestPath = url.pathname === '/' ? '/editor/index.html' : url.pathname;
      sendFile(req, res, resolvePublicPath(requestPath)); return;
    }
    json(res, 404, { error: '找不到此操作。' });
  } catch (error) { if (!res.headersSent && !res.destroyed) json(res, 400, { error: error.message }); }
}
function openEditor() {
  if (!process.argv.includes('--no-open')) {
    const child = spawn('open', ['http://localhost:' + editorPort], { stdio: 'ignore' }); child.on('error', () => {});
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    build();
    const server = http.createServer(handler);
    localServer = server;
    server.requestTimeout = 30 * 60 * 1000;
    server.on('error', async error => {
      if (error.code === 'EADDRINUSE') {
        try { const state = await (await fetch('http://127.0.0.1:' + editorPort + '/api/state')).json(); if (state.appId === appId && state.projectDir === root) { openEditor(); return; } } catch {}
      }
      console.error('Editor could not start: ' + error.message); process.exitCode = 1;
    });
    server.listen(editorPort, '127.0.0.1', () => {
      console.log('\n素材與位置設定：http://localhost:' + editorPort);
      console.log('HyperFrames 預覽：http://localhost:3017/#project/' + projectName);
      console.log('Keep this Terminal open. Opening the editor does not download a segmentation model.\n');
      openEditor(); startStudio();
    });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
