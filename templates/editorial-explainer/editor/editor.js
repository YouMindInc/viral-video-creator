const $ = selector => document.querySelector(selector);
let config, metadata, defaults, state, dirty = false, busy = false, previousJob = 'idle';
const notice = (text, error = false) => { $('#notice').textContent = text; $('#notice').classList.toggle('error', error); };
const get = (obj, key) => key.split('.').reduce((value, part) => value?.[part], obj);
const set = (obj, key, value) => { const parts = key.split('.'), last = parts.pop(); parts.reduce((node, part) => node[part], obj)[last] = value; };
async function api(route, body) {
  const response = await fetch('/api/' + route, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json(); if (!response.ok) throw new Error(value.error || '操作未完成。'); return value;
}
function locking(value) { busy = value; $('#fields').disabled = value; $('#save').disabled = value; }
function changed() { dirty = true; $('#save-state').textContent = '有未儲存的變更'; updatePreview(); }
function updatePreview() {
  if (!config) return;
  $('#preview').contentWindow?.postMessage({ type: 'layout-update', config, guides: $('#guides').checked, mode: metadata?.personaMode }, location.origin);
  $('#person-ratio').textContent = (config.layout.persona.height / 1920 * 100).toFixed(1) + '%';
}
function fillLayout() {
  const key = $('#layout-target').value, box = config.layout[key];
  document.querySelectorAll('[data-layout]').forEach(input => { input.value = box[input.dataset.layout] ?? ''; input.readOnly = key === 'persona' && input.dataset.layout === 'height'; });
  $('#font-control').hidden = box.fontSize === undefined;
  $('#radius-control').hidden = box.radius === undefined;
}
function fillForm() {
  document.querySelectorAll('[data-field]').forEach(input => { input.value = get(config, input.dataset.field) ?? ''; });
  $('#persona-file').textContent = config.persona.source.split('/').pop();
  $('#visual-file').textContent = config.visual.video.split('/').pop();
  $('#captions-file').textContent = config.captions ? config.captions.split('/').pop() : '未選取字幕';
  $('#clear-captions').disabled = !config.captions;
  $('#duration').textContent = metadata.duration.toFixed(2) + ' 秒';
  $('[data-field="persona.cropY"]').max = metadata.crop.maxY;
  fillLayout(); updatePreview();
}
function reloadPreview() { $('#preview').src = '/layout-preview?v=' + Date.now(); }
async function save() {
  locking(true);
  try {
    const result = await api('save', config); config = result.config; metadata = result.metadata; dirty = false;
    fillForm(); reloadPreview(); $('#save-state').textContent = '已儲存至專案';
    notice('已套用 · ' + metadata.duration.toFixed(2) + ' 秒 · ' + (metadata.personaMode === 'sam2' ? 'SAM2 人物輪廓' : metadata.personaMode === 'cutout' ? '人物輪廓' : '原始錄影預覽'));
    return true;
  } catch (error) { notice(error.message, true); throw error; }
  finally { locking(false); }
}
async function selectFile(kind, file) {
  if (!file || busy || state?.job.status === 'running') return;
  locking(true); notice('正在匯入 ' + file.name + '…');
  try {
    const response = await fetch('/api/upload?kind=' + kind + '&name=' + encodeURIComponent(file.name), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
    const value = await response.json(); if (!response.ok) throw new Error(value.error);
    if (kind === 'persona') { config.persona.source = value.path; config.persona.cropY = Math.min(config.persona.cropY, value.info.maxCropY); config.captions = ''; }
    if (kind === 'visual') { config.visual.video = value.path; config.visual.poster = ''; }
    if (kind === 'captions') config.captions = value.path;
    dirty = true; await save();
    if (kind === 'persona' && !value.info.hasAudio) notice('人物錄影已匯入，但這個檔案沒有聲音。');
  } catch (error) { notice(error.message, true); }
  finally { locking(false); }
}
function refreshJob(next) {
  const running = next.job.status === 'running';
  if (!busy) { $('#fields').disabled = running; $('#save').disabled = running; }
  $('#prepare').disabled = running || !next.sam2Tests;
  $('#job-log').textContent = next.job.log || '使用 tools/sam2 已安裝的模型；目前未執行處理。';
  $('#cutout-status').textContent = running ? 'SAM2 處理中，可繼續查看預覽。' : next.metadata.personaPrepared ? '人物輪廓已備妥。更換人物或背景框設定後，請重新產生。' : '先檢查抽樣畫面，再產生完整人物圖層。';
  const samples = $('#sam2-samples'), paths = next.sam2Tests?.images || [];
  if (samples.dataset.paths !== paths.join(',')) {
    samples.replaceChildren(); samples.dataset.paths = paths.join(',');
    for (const src of paths) { const a = document.createElement('a'); a.href = '/' + src; a.target = '_blank'; a.rel = 'noopener'; const img = document.createElement('img'); img.src = '/' + src; img.alt = '人物去背抽樣，點開檢查髮絲與輪廓'; a.append(img); samples.append(a); }
  }
  $('#studio-link').href = next.studio.url;
  $('#studio-status').textContent = next.studio.status === 'ready' ? 'HyperFrames 預覽服務已就緒' : next.studio.status === 'error' ? 'HyperFrames 未啟動：可在 Terminal 執行 npm run preview。' : '正在啟動 HyperFrames 預覽…';
  if (previousJob === 'running' && !running) {
    if (next.job.status === 'done') { metadata = next.metadata; reloadPreview(); notice(next.job.kind === 'test' ? '抽樣完成。點開下方圖片檢查，再按「產生完整人物圖層」。' : 'SAM2 人物圖層已套用。'); }
    else notice(next.job.error, true);
  }
  previousJob = next.job.status;
}
async function poll() {
  try { state = await api('state'); refreshJob(state); }
  catch { $('#studio-status').textContent = '設定頁服務已中斷，請在 Terminal 重新執行 pnpm start。'; }
}
async function beginJob(kind) {
  try {
    if (dirty) await save();
    await api(kind === 'test' ? 'sam2-test' : 'prepare', {});
    $('#job-details').open = true; notice(kind === 'test' ? '正在產生五張 SAM2 抽樣圖…' : '正在產生完整人物圖層…'); await poll();
  } catch (error) { notice(error.message, true); }
}
$('#form').addEventListener('submit', event => { event.preventDefault(); save().catch(() => {}); });
document.querySelectorAll('[data-field]').forEach(input => input.addEventListener('input', () => { set(config, input.dataset.field, input.type === 'number' ? Number(input.value) : input.value); changed(); }));
document.querySelectorAll('[data-layout]').forEach(input => input.addEventListener('input', () => {
  const key = $('#layout-target').value; config.layout[key][input.dataset.layout] = Number(input.value);
  if (key === 'persona') { config.layout.persona.height = config.layout.persona.width * 640 / 1080; fillLayout(); }
  changed();
}));
document.querySelectorAll('[data-upload]').forEach(input => input.addEventListener('change', () => { selectFile(input.dataset.upload, input.files[0]); input.value = ''; }));
document.querySelectorAll('[data-drop]').forEach(zone => {
  zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('dragging'); selectFile(zone.dataset.drop, event.dataTransfer.files[0]); });
});
$('#layout-target').addEventListener('change', fillLayout);
$('#guides').addEventListener('change', updatePreview);
$('#reset-layout').addEventListener('click', () => { config.layout = structuredClone(defaults); fillLayout(); changed(); });
$('#clear-captions').addEventListener('click', () => { config.captions = ''; fillForm(); changed(); });
$('#sam2-test').addEventListener('click', () => beginJob('test'));
$('#prepare').addEventListener('click', () => beginJob('prepare'));
$('#studio-link').addEventListener('click', async event => {
  if (!dirty) return;
  event.preventDefault(); const windowRef = window.open('about:blank', '_blank');
  try { await save(); if (windowRef) { windowRef.opener = null; windowRef.location = state.studio.url; } else location.assign(state.studio.url); }
  catch { windowRef?.close(); }
});
window.addEventListener('message', event => { if (event.origin === location.origin && event.data?.type === 'layout-ready') updatePreview(); });
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
new ResizeObserver(entries => { $('#preview').style.transform = 'scale(' + entries[0].contentRect.width / 1080 + ')'; }).observe($('.preview-window'));
(async () => {
  try { state = await api('state'); config = state.config; metadata = state.metadata; defaults = state.defaultLayout; fillForm(); refreshJob(state); notice('已載入模板 · 選取素材後會自動套用，文字與位置調整後請儲存。'); }
  catch (error) { notice(error.message, true); $('#fields').disabled = true; }
  setInterval(poll, 2500);
})();
